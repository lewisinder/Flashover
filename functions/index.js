const functions = require('firebase-functions');
const os = require('os');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const admin = require('firebase-admin');
const sharp = require('sharp');
const Busboy = require('busboy');

// --- Firebase Admin SDK Initialization ---
admin.initializeApp();

// Get a reference to the default Cloud Storage bucket
const bucket = admin.storage().bucket();
const db = admin.firestore();
// --- End of Firebase Initialization ---

const app = express();

// --- Middleware ---
const verifyToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).json({ message: 'Unauthorized: No token provided.' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying Firebase ID token:', error);
        res.status(403).json({ message: 'Unauthorized: Invalid token.' });
    }
};

// ===================================================================
// API Router Setup
// ===================================================================
const apiRouter = express.Router();

// Apply token verification to all /api routes
apiRouter.use(verifyToken);

// --- Image Upload & Delete Routes ---
// These routes are defined *before* the JSON body parser middleware.
// This is critical to prevent the JSON parser from interfering with the file stream.

apiRouter.post('/upload', (req, res) => {
    // This is the critical change. In Firebase Cloud Functions, the request stream is
    // already consumed. The raw body is available in `req.rawBody`. We must use this.
    if (!req.rawBody) {
        console.error('Request did not have a rawBody. This is unexpected in the Firebase environment.');
        return res.status(400).json({ message: 'Missing request body.' });
    }

    const busboy = Busboy({ headers: req.headers });
    const tmpdir = os.tmpdir();
    const uploads = {};
    const fileWrites = []; // A promise array to track all file writes

    busboy.on('file', (fieldname, file, { filename }) => {
        console.log(`Processing file: ${filename}`);
        const filepath = path.join(tmpdir, filename);
        uploads.filepath = filepath;
        
        const writeStream = fsSync.createWriteStream(filepath);
        file.pipe(writeStream);

        // Create a promise that resolves when the file is fully written
        const promise = new Promise((resolve, reject) => {
            file.on('end', () => {
                writeStream.end();
            });
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        fileWrites.push(promise);
    });

    busboy.on('finish', async () => {
        // This is the critical change: wait for all file writes to complete.
        await Promise.all(fileWrites);

        if (!uploads.filepath) {
            return res.status(400).json({ message: 'No file uploaded.' });
        }

        try {
            const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
            const newFilename = `image-${uniqueSuffix}.webp`;
            const processedTmpPath = path.join(tmpdir, newFilename);

            await sharp(uploads.filepath)
                .resize(800, 800, { fit: 'cover', withoutEnlargement: true })
                .toFormat('webp', { quality: 80 })
                .toFile(processedTmpPath);

            const destination = `uploads/${newFilename}`;
            await bucket.upload(processedTmpPath, {
                destination: destination,
                metadata: {
                    contentType: 'image/webp',
                    cacheControl: 'public, max-age=31536000',
                },
            });

            const file = bucket.file(destination);
            await file.makePublic();
            const publicUrl = file.publicUrl();

            await fs.unlink(uploads.filepath);
            await fs.unlink(processedTmpPath);

            res.status(200).json({
                message: 'File uploaded successfully!',
                filePath: publicUrl,
            });

        } catch (error) {
            console.error('Upload process failed:', error);
            res.status(500).json({ message: 'Failed to process and upload image.' });
        }
    });

    // Feed busboy the raw request body from the Firebase environment.
    // This is the definitive fix for the "Unexpected end of form" error.
    busboy.end(req.rawBody);
});

apiRouter.delete('/image/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        if (!fileName || fileName.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }
        
        const file = bucket.file(`uploads/${fileName}`);
        await file.delete();

        res.status(200).json({ message: 'Image deleted successfully.' });

    } catch (err) {
        if (err.code === 404) {
            return res.status(200).json({ message: 'Image already deleted or not found.' });
        }
        console.error('Error deleting image from storage:', err);
        res.status(500).json({ message: 'Error deleting image.' });
    }
});

// --- JSON Body Parser ---
// This middleware is applied *after* the file upload routes.
// All routes defined below this point will be able to parse JSON bodies.
apiRouter.use(express.json());

// ===================================================================
// USER DATA ROUTES
// ===================================================================
const userRouter = express.Router();

userRouter.get('/:userId', async (req, res) => {
    try {
        const userDocRef = db.collection('users').doc(req.user.uid);
        const doc = await userDocRef.get();

        if (doc.exists) {
            return res.json(doc.data());
        }
        const defaultData = { appliances: [] };
        await db.collection('users').doc(req.user.uid).set(defaultData);
        return res.json({ ...defaultData, serverTime: new Date().toISOString() });
    } catch (err) {
        console.error('Error in get-data route:', err);
        res.status(500).json({ message: 'Error loading data.' });
    }
});

userRouter.post('/:userId', async (req, res) => {
    try {
        const userDocRef = db.collection('users').doc(req.user.uid);
        await userDocRef.set(req.body);
        res.json({ message: 'Data saved successfully!' });
    } catch (err) {
        console.error('Error writing data to Firestore:', err);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

apiRouter.use('/data', userRouter);

// ===================================================================
// BRIGADE ROUTES
// ===================================================================
const brigadeRouter = express.Router();

// ... (All existing brigade routes will be here, no changes needed)
// GET /api/brigades/region/:regionName
brigadeRouter.get('/region/:regionName', async (req, res) => {
    try {
        const { regionName } = req.params;
        const brigadesRef = db.collection('brigades');
        const snapshot = await brigadesRef.where('region', '==', regionName).get();
        if (snapshot.empty) return res.json([]);
        const brigades = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(brigades);
    } catch (error) {
        console.error(`Error fetching brigades for region ${req.params.regionName}:`, error);
        res.status(500).json({ message: 'Failed to fetch brigades.' });
    }
});

// GET /api/brigades/:brigadeId/join-requests
brigadeRouter.get('/:brigadeId/join-requests', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const adminId = req.user.uid;

        const adminMemberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(adminId);
        const adminDoc = await adminMemberRef.get();
        if (!adminDoc.exists || adminDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to view join requests.' });
        }

        const requestsSnapshot = await db.collection('brigades').doc(brigadeId).collection('joinRequests').where('status', '==', 'pending').get();
        const requests = requestsSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.json(requests);

    } catch (error) {
        console.error(`Error fetching join requests for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch join requests.' });
    }
});
// POST /api/brigades/:brigadeId/join-requests
brigadeRouter.post('/:brigadeId/join-requests', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const { uid: userId, name: userName, email } = req.user;

        const joinRequestRef = db.collection('brigades').doc(brigadeId).collection('joinRequests').doc(userId);

        const doc = await joinRequestRef.get();
        if (doc.exists) {
            return res.status(400).json({ message: 'You have already sent a join request to this brigade.' });
        }

        await joinRequestRef.set({
            status: 'pending',
            requestedAt: admin.firestore.FieldValue.serverTimestamp(),
            userName: userName || email
        });

        res.status(201).json({ message: 'Your request to join has been sent.' });

    } catch (error) {
        console.error(`Error creating join request for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to send join request.' });
    }
});
// POST /api/brigades/:brigadeId/join-requests/:userId
brigadeRouter.post('/:brigadeId/join-requests/:userId', async (req, res) => {
    try {
        const { brigadeId, userId } = req.params;
        const { action } = req.body;
        const adminId = req.user.uid;

        const adminMemberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(adminId);
        const adminDoc = await adminMemberRef.get();
        if (!adminDoc.exists || adminDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to handle join requests.' });
        }

        const requestRef = db.collection('brigades').doc(brigadeId).collection('joinRequests').doc(userId);

        if (action === 'accept') {
            const requestDoc = await requestRef.get();
            if (!requestDoc.exists) {
                return res.status(404).json({ message: 'Join request not found.' });
            }
            const { userName } = requestDoc.data();

            const brigadeRef = db.collection('brigades').doc(brigadeId);
            const newMemberRef = brigadeRef.collection('members').doc(userId);
            const userBrigadeRef = db.collection('users').doc(userId).collection('userBrigades').doc(brigadeId);
            const brigadeDoc = await brigadeRef.get();
            const brigadeData = brigadeDoc.data();

            await db.runTransaction(async (transaction) => {
                transaction.set(newMemberRef, {
                    role: 'Member',
                    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                    name: userName
                });
                transaction.set(userBrigadeRef, {
                    brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`,
                    role: 'Member'
                });
                transaction.delete(requestRef);
            });

            res.status(200).json({ message: `User ${userName} has been added to the brigade.` });

        } else if (action === 'deny') {
            await requestRef.delete();
            res.status(200).json({ message: 'Join request has been denied.' });
        } else {
            res.status(400).json({ message: 'Invalid action.' });
        }

    } catch (error) {
        console.error(`Error handling join request for user ${req.params.userId}:`, error);
        res.status(500).json({ message: 'Failed to handle join request.' });
    }
});
// POST /api/brigades/:brigadeId/members
brigadeRouter.post('/:brigadeId/members', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const { email: newMemberEmail } = req.body;
        const adminId = req.user.uid;

        if (!newMemberEmail) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);

        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || adminMemberDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to add members.' });
        }

        const newMemberUserRecord = await admin.auth().getUserByEmail(newMemberEmail);
        const newMemberId = newMemberUserRecord.uid;
        const newMemberName = newMemberUserRecord.displayName || newMemberEmail;

        const newMemberRef = brigadeRef.collection('members').doc(newMemberId);
        const userRef = db.collection('users').doc(newMemberId);
        const userBrigadeRef = userRef.collection('userBrigades').doc(brigadeId);
        
        const brigadeDoc = await brigadeRef.get();
        const brigadeData = brigadeDoc.data();

        await db.runTransaction(async (transaction) => {
            transaction.set(newMemberRef, {
                role: 'Member',
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                name: newMemberName
            });
            transaction.set(userBrigadeRef, {
                brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`,
                role: 'Member'
            });
        });

        res.status(201).json({ message: `User ${newMemberName} added to brigade successfully.` });

    } catch (error) {
        console.error(`Error adding member to brigade ${req.params.brigadeId}:`, error);
        if (error.code === 'auth/user-not-found') {
            return res.status(404).json({ message: 'User with that email address does not exist.' });
        }
        res.status(500).json({ message: 'Failed to add member.' });
    }
});
// PUT /api/brigades/:brigadeId/members/:memberId
brigadeRouter.put('/:brigadeId/members/:memberId', async (req, res) => {
    try {
        const { brigadeId, memberId } = req.params;
        const { role } = req.body;
        const adminId = req.user.uid;

        if (!role) {
            return res.status(400).json({ message: 'Role is required.' });
        }

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const targetMemberRef = brigadeRef.collection('members').doc(memberId);
        const targetUserBrigadeRef = db.collection('users').doc(memberId).collection('userBrigades').doc(brigadeId);

        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || adminMemberDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to update roles.' });
        }

        await db.runTransaction(async (transaction) => {
            transaction.update(targetMemberRef, { role: role });
            transaction.update(targetUserBrigadeRef, { role: role });
        });

        res.status(200).json({ message: 'Role updated successfully.' });

    } catch (error) {
        console.error(`Error updating role for member ${req.params.memberId}:`, error);
        res.status(500).json({ message: 'Failed to update role.' });
    }
});
// DELETE /api/brigades/:brigadeId/members/:memberId
brigadeRouter.delete('/:brigadeId/members/:memberId', async (req, res) => {
    try {
        const { brigadeId, memberId } = req.params;
        const adminId = req.user.uid;

        if (adminId === memberId) {
            return res.status(400).json({ message: 'An admin cannot remove themselves.' });
        }

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);
        const targetMemberRef = brigadeRef.collection('members').doc(memberId);
        const targetUserBrigadeRef = db.collection('users').doc(memberId).collection('userBrigades').doc(brigadeId);

        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || adminMemberDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to remove members.' });
        }

        await db.runTransaction(async (transaction) => {
            transaction.delete(targetMemberRef);
            transaction.delete(targetUserBrigadeRef);
        });

        res.status(200).json({ message: 'Member removed successfully.' });

    } catch (error) {
        console.error(`Error removing member ${req.params.memberId}:`, error);
        res.status(500).json({ message: 'Failed to remove member.' });
    }
});
// POST /api/brigades/:brigadeId/leave
brigadeRouter.post('/:brigadeId/leave', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const memberRef = brigadeRef.collection('members').doc(userId);
        const userBrigadeRef = db.collection('users').doc(userId).collection('userBrigades').doc(brigadeId);

        const memberDoc = await memberRef.get();
        if (memberDoc.exists && memberDoc.data().role === 'Admin') {
            const membersSnapshot = await brigadeRef.collection('members').where('role', '==', 'Admin').get();
            if (membersSnapshot.size <= 1) {
                return res.status(400).json({ message: 'You cannot leave as you are the last admin. Please promote another member to Admin first.' });
            }
        }

        await db.runTransaction(async (transaction) => {
            transaction.delete(memberRef);
            transaction.delete(userBrigadeRef);
        });

        res.status(200).json({ message: 'You have successfully left the brigade.' });

    } catch (error) {
        console.error(`Error leaving brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to leave brigade.' });
    }
});
// GET /api/brigades/:brigadeId/data
brigadeRouter.get('/:brigadeId/data', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;

        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();

        if (!brigadeDoc.exists) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const brigadeData = brigadeDoc.data();
        const applianceData = brigadeData.applianceData || { appliances: [] };

        res.status(200).json(applianceData);

    } catch (error) {
        console.error(`Error fetching appliance data for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch appliance data.' });
    }
});
// POST /api/brigades/:brigadeId/data
brigadeRouter.post('/:brigadeId/data', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const userId = req.user.uid;
        const newData = req.body;

        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        await brigadeRef.update({ applianceData: newData });

        res.status(200).json({ message: 'Appliance data saved successfully!' });

    } catch (error) {
        console.error(`Error saving appliance data for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to save appliance data.' });
    }
});

// POST /api/brigades - Create a new brigade
brigadeRouter.post('/', async (req, res) => {
    try {
        const { name, stationNumber, region } = req.body;
        const creatorId = req.user.uid;
        const creatorName = req.user.name || req.user.email;

        if (!name || !stationNumber || !region) {
            return res.status(400).json({ message: 'Missing required fields: name, stationNumber, and region are required.' });
        }

        const newBrigadeRef = db.collection('brigades').doc();
        const brigadeId = newBrigadeRef.id;

        const newBrigadeData = {
            name: name,
            stationNumber: stationNumber,
            region: region,
            creatorId: creatorId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            applianceData: { appliances: [] }
        };

        const adminMemberRef = newBrigadeRef.collection('members').doc(creatorId);
        const userBrigadeRef = db.collection('users').doc(creatorId).collection('userBrigades').doc(brigadeId);

        await db.runTransaction(async (transaction) => {
            transaction.set(newBrigadeRef, newBrigadeData);
            transaction.set(adminMemberRef, {
                role: 'Admin',
                joinedAt: admin.firestore.FieldValue.serverTimestamp(),
                name: creatorName
            });
            transaction.set(userBrigadeRef, {
                brigadeName: `${name} (${stationNumber})`,
                role: 'Admin'
            });
        });

        res.status(201).json({
            message: 'Brigade created successfully!',
            brigadeId: brigadeId
        });

    } catch (error) {
        console.error('Error creating brigade:', error);
        res.status(500).json({ message: 'Failed to create brigade.' });
    }
});

// --- Check Status Endpoints ---
// GET /api/brigades/:brigadeId/appliances/:applianceId/check-status
brigadeRouter.get('/:brigadeId/appliances/:applianceId/check-status', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();

        if (!brigadeDoc.exists) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const applianceData = brigadeDoc.data().applianceData || { appliances: [] };
        const appliance = applianceData.appliances.find(a => a.id === applianceId);

        if (appliance && appliance.checkStatus && appliance.checkStatus.inProgress) {
            res.json({
                inProgress: true,
                user: appliance.checkStatus.user,
                uid: appliance.checkStatus.uid,
                timestamp: appliance.checkStatus.timestamp
            });
        } else {
            res.json({ inProgress: false });
        }
    } catch (error) {
        console.error('Error getting check status:', error);
        res.status(500).json({ message: 'Failed to get check status.' });
    }
});
// POST /api/brigades/:brigadeId/appliances/:applianceId/start-check
brigadeRouter.post('/:brigadeId/appliances/:applianceId/start-check', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const { uid, name, email } = req.user;

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        const applianceData = brigadeDoc.data().applianceData || { appliances: [] };

        const applianceIndex = applianceData.appliances.findIndex(a => a.id === applianceId);
        if (applianceIndex === -1) {
            return res.status(404).json({ message: 'Appliance not found.' });
        }

        applianceData.appliances[applianceIndex].checkStatus = {
            inProgress: true,
            user: name || email,
            uid: uid,
            timestamp: new Date().toISOString()
        };

        await brigadeRef.update({ applianceData });
        res.status(200).json({ message: 'Check started successfully.' });
    } catch (error) {
        console.error('Error starting check:', error);
        res.status(500).json({ message: 'Failed to start check.' });
    }
});
// POST /api/brigades/:brigadeId/appliances/:applianceId/complete-check
brigadeRouter.post('/:brigadeId/appliances/:applianceId/complete-check', async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        const applianceData = brigadeDoc.data().applianceData || { appliances: [] };

        const applianceIndex = applianceData.appliances.findIndex(a => a.id === applianceId);
        if (applianceIndex !== -1 && applianceData.appliances[applianceIndex].checkStatus) {
            delete applianceData.appliances[applianceIndex].checkStatus;
            await brigadeRef.update({ applianceData });
        }
        
        res.status(200).json({ message: 'Check completed successfully.' });
    } catch (error) {
        console.error('Error completing check:', error);
        res.status(500).json({ message: 'Failed to complete check.' });
    }
});

// --- Generic Brigade routes (must come last) ---
// GET /api/brigades/:brigadeId
brigadeRouter.get('/:brigadeId', async (req, res) => {
    try {
        const brigadeId = req.params.brigadeId;
        const userId = req.user.uid;

        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();

        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();

        if (!brigadeDoc.exists) {
            return res.status(404).json({ message: 'Brigade not found.' });
        }

        const brigadeData = brigadeDoc.data();

        const membersCollectionRef = brigadeRef.collection('members');
        const membersSnapshot = await membersCollectionRef.get();
        const members = membersSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        res.status(200).json({
            ...brigadeData,
            members: members
        });

    } catch (error) {
        console.error(`Error fetching brigade data for ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch brigade data.' });
    }
});
// DELETE /api/brigades/:brigadeId
brigadeRouter.delete('/:brigadeId', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const adminId = req.user.uid;

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const adminMemberRef = brigadeRef.collection('members').doc(adminId);

        const adminMemberDoc = await adminMemberRef.get();
        if (!adminMemberDoc.exists || adminMemberDoc.data().role !== 'Admin') {
            return res.status(403).json({ message: 'Forbidden: You must be an admin to delete a brigade.' });
        }

        const batch = db.batch();

        const membersSnapshot = await brigadeRef.collection('members').get();
        membersSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
            const userBrigadeRef = db.collection('users').doc(doc.id).collection('userBrigades').doc(brigadeId);
            batch.delete(userBrigadeRef);
        });

        const joinRequestsSnapshot = await brigadeRef.collection('joinRequests').get();
        joinRequestsSnapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        batch.delete(brigadeRef);

        await batch.commit();

        res.status(200).json({ message: 'Brigade deleted successfully.' });

    } catch (error) {
        console.error(`Error deleting brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to delete brigade.' });
    }
});

apiRouter.use('/brigades', brigadeRouter);

// ===================================================================
// REPORT ROUTES
// ===================================================================
const reportRouter = express.Router();

// ... (All existing report routes will be here, no changes needed)
reportRouter.get('/brigade/:brigadeId', async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const reportsRef = db.collection('brigades').doc(brigadeId).collection('reports');
        const snapshot = await reportsRef.orderBy('date', 'desc').get();
        
        if (snapshot.empty) {
            return res.json([]);
        }
        
        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(reports);

    } catch (error) {
        console.error(`Error fetching reports for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch reports.' });
    }
});

reportRouter.post('/', async (req, res) => {
    try {
        const reportData = req.body;
        const { brigadeId, applianceId, applianceName, date, username } = reportData;
        const uid = req.user.uid;

        if (!brigadeId || !applianceId || !date || !username) {
            return res.status(400).json({ message: 'Missing required report data.' });
        }

        const reportRef = db.collection('brigades').doc(brigadeId).collection('reports').doc();
        const reportId = reportRef.id;

        const reportFileName = `${reportId}.json`;
        const reportFilePath = path.join(os.tmpdir(), reportFileName);
        await fs.writeFile(reportFilePath, JSON.stringify(reportData, null, 2));

        await reportRef.set({
            date: date,
            applianceName: applianceName,
            creatorName: username,
            creatorId: uid,
            fileName: reportFileName
        });

        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();
        if (brigadeDoc.exists) {
            const applianceData = brigadeDoc.data().applianceData || { appliances: [] };
            const applianceIndex = applianceData.appliances.findIndex(a => a.id === applianceId);
            if (applianceIndex !== -1 && applianceData.appliances[applianceIndex].checkStatus) {
                delete applianceData.appliances[applianceIndex].checkStatus;
                await brigadeRef.update({ applianceData });
            }
        }

        // --- Start of Email Notification Logic ---
        try {
            const membersSnapshot = await db.collection('brigades').doc(brigadeId).collection('members').get();
            if (!membersSnapshot.empty) {
                const memberIds = membersSnapshot.docs.map(doc => doc.id);

                const userPromises = memberIds.map(uid => admin.auth().getUser(uid));
                const userRecords = await Promise.all(userPromises);

                const recipients = userRecords.map(userRecord => userRecord.email).filter(email => !!email);

                if (recipients.length > 0) {
                    const mailCollection = db.collection('mail');
                    const emailPromises = recipients.map(email => {
                        return mailCollection.add({
                            to: email,
                            message: {
                                subject: `New Report Submitted for ${applianceName}`,
                                html: `
                                    <p>Hello,</p>
                                    <p>A new report for appliance <strong>${applianceName}</strong> was completed by <strong>${username}</strong> on ${new Date(date).toLocaleString()}.</p>
                                    <p>You can view the report in the Flashover app.</p>
                                `,
                            },
                        });
                    });
                    await Promise.all(emailPromises);
                    console.log(`Successfully queued emails for ${recipients.length} brigade members.`);
                }
            }
        } catch (emailError) {
            console.error("Failed to send email notifications:", emailError);
            // We do not block the main response for email errors.
        }
        // --- End of Email Notification Logic ---

        res.status(201).json({ message: 'Report saved successfully.', reportId: reportId });

    } catch (err) {
        console.error('Error saving report:', err);
        res.status(500).json({ message: 'Error saving report.' });
    }
});

reportRouter.get('/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const reportFileName = `${reportId}.json`;
        
        if (reportFileName.includes('..')) {
            return res.status(400).json({ message: 'Invalid report ID.' });
        }

        const filePath = path.join(os.tmpdir(), reportFileName);
        const data = await fs.readFile(filePath, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        console.error('Error reading report file:', err);
        if (err.code === 'ENOENT') {
            return res.status(404).json({ message: 'Report not found.' });
        }
        res.status(500).json({ message: 'Error loading report.' });
    }
});

apiRouter.use('/reports', reportRouter);

// ===================================================================
// FINAL APP SETUP
// ===================================================================
// Mount the main API router
app.use('/api', apiRouter);

// Export the Express app as a single Cloud Function
exports.api = functions
    .runWith({ serviceAccount: 'cloud-functions-agent@flashoverapp.iam.gserviceaccount.com' })
    .https.onRequest(app);
