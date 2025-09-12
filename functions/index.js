const functions = require('firebase-functions');
const admin = require('firebase-admin');
const sgMail = require('@sendgrid/mail');
const os = require('os');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const Busboy = require('busboy');

// --- Firebase Admin SDK Initialization ---
admin.initializeApp();

// --- SendGrid Initialization ---
const SENDGRID_API_KEY = functions.config().sendgrid.key;
sgMail.setApiKey(SENDGRID_API_KEY);
const DEFAULT_FROM_EMAIL = "hello@theblueprintcollective.co.nz";

// --- Firestore/Storage References ---
const bucket = admin.storage().bucket();
const db = admin.firestore();

// ===================================================================
// NEW EMAIL TRIGGER FUNCTION
// ===================================================================
exports.processEmail = functions.region("australia-southeast1").firestore
    .document("mail/{documentId}")
    .onCreate(async (snap, context) => {
      const mailData = snap.data();
      const msg = {
        to: mailData.to,
        from: mailData.from || DEFAULT_FROM_EMAIL,
        subject: mailData.message.subject,
        text: mailData.message.text,
        html: mailData.message.html,
      };
      try {
        await sgMail.send(msg);
        console.log("Email sent successfully to:", msg.to);
        return snap.ref.set({status: "sent"}, {merge: true});
      } catch (error) {
        console.error("Error sending email:", error);
        return snap.ref.set({status: "error", error: error.toString()}, {merge: true});
      }
    });

// ===================================================================
// API EXPRESS APP
// ===================================================================
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

const apiRouter = express.Router();
apiRouter.use(verifyToken);

// --- Image Upload & Delete Routes ---
apiRouter.post('/upload', (req, res) => {
    if (!req.rawBody) {
        console.error('Request did not have a rawBody.');
        return res.status(400).json({ message: 'Missing request body.' });
    }
    const busboy = Busboy({ headers: req.headers });
    const tmpdir = os.tmpdir();
    const uploads = {};
    const fileWrites = [];
    busboy.on('file', (fieldname, file, { filename }) => {
        const filepath = path.join(tmpdir, filename);
        uploads.filepath = filepath;
        const writeStream = fsSync.createWriteStream(filepath);
        file.pipe(writeStream);
        const promise = new Promise((resolve, reject) => {
            file.on('end', () => { writeStream.end(); });
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
        fileWrites.push(promise);
    });
    busboy.on('finish', async () => {
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
                metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000' },
            });
            const file = bucket.file(destination);
            await file.makePublic();
            const publicUrl = file.publicUrl();
            await fs.unlink(uploads.filepath);
            await fs.unlink(processedTmpPath);
            res.status(200).json({ message: 'File uploaded successfully!', filePath: publicUrl });
        } catch (error) {
            console.error('Upload process failed:', error);
            res.status(500).json({ message: 'Failed to process and upload image.' });
        }
    });
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

apiRouter.use(express.json());

// --- User Data Routes ---
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

// --- Brigade Routes ---
const brigadeRouter = express.Router();
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
        const requests = requestsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(requests);
    } catch (error) {
        console.error(`Error fetching join requests for brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch join requests.' });
    }
});
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
                transaction.set(newMemberRef, { role: 'Member', joinedAt: admin.firestore.FieldValue.serverTimestamp(), name: userName });
                transaction.set(userBrigadeRef, { brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`, role: 'Member' });
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
            transaction.set(newMemberRef, { role: 'Member', joinedAt: admin.firestore.FieldValue.serverTimestamp(), name: newMemberName });
            transaction.set(userBrigadeRef, { brigadeName: `${brigadeData.name} (${brigadeData.stationNumber})`, role: 'Member' });
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
brigadeRouter.get('/:brigadeId/reports/:reportId', async (req, res) => {
    try {
        const { brigadeId, reportId } = req.params;
        const userId = req.user.uid;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        const memberDoc = await memberRef.get();
        if (!memberDoc.exists) {
            return res.status(403).json({ message: 'Forbidden: You are not a member of this brigade.' });
        }
        const reportRef = db.collection('brigades').doc(brigadeId).collection('reports').doc(reportId);
        const reportDoc = await reportRef.get();
        if (!reportDoc.exists) {
            return res.status(404).json({ message: 'Report not found.' });
        }
        res.status(200).json({ id: reportDoc.id, ...reportDoc.data() });
    } catch (error) {
        console.error(`Error fetching report ${req.params.reportId}:`, error);
        res.status(500).json({ message: 'Failed to fetch report.' });
    }
});
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
            transaction.set(adminMemberRef, { role: 'Admin', joinedAt: admin.firestore.FieldValue.serverTimestamp(), name: creatorName });
            transaction.set(userBrigadeRef, { brigadeName: `${name} (${stationNumber})`, role: 'Admin' });
        });
        res.status(201).json({ message: 'Brigade created successfully!', brigadeId: brigadeId });
    } catch (error) {
        console.error('Error creating brigade:', error);
        res.status(500).json({ message: 'Failed to create brigade.' });
    }
});
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
        const members = membersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.status(200).json({ ...brigadeData, members: members });
    } catch (error) {
        console.error(`Error fetching brigade data for ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to fetch brigade data.' });
    }
});
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
        joinRequestsSnapshot.docs.forEach(doc => { batch.delete(doc.ref); });
        batch.delete(brigadeRef);
        await batch.commit();
        res.status(200).json({ message: 'Brigade deleted successfully.' });
    } catch (error) {
        console.error(`Error deleting brigade ${req.params.brigadeId}:`, error);
        res.status(500).json({ message: 'Failed to delete brigade.' });
    }
});
apiRouter.use('/brigades', brigadeRouter);

// --- Report Routes ---
const reportRouter = express.Router();
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
// A helper function to generate the rich HTML for the report email
const generateReportHtml = (reportData) => {
    // Safely destructure with default values
    const { applianceName = 'Unknown Appliance', date, username = 'Unknown User', sections = [] } = reportData || {};

    // --- Safe Date Formatting ---
    let formattedDate = 'an unknown date';
    try {
        if (date) {
            formattedDate = new Date(date).toLocaleString();
        }
    } catch (e) {
        console.error('Could not parse date:', date);
    }

    // --- Inline Styles ---
    const styles = {
        body: `font-family: sans-serif; color: #333;`,
        h2: `color: #333;`,
        h3: `color: #555; border-bottom: 1px solid #ddd; padding-bottom: 5px;`,
        table: `width: 100%; border-collapse: collapse; margin-bottom: 20px;`,
        th: `border: 1px solid #ddd; padding: 10px; text-align: left; background-color: #f2f2f2;`,
        td: `border: 1px solid #ddd; padding: 10px; vertical-align: top;`,
        notes: `font-style: italic; color: #666;`,
        locker: `background-color: #f0f0f0; font-weight: bold;`,
        subItem: `padding-left: 30px; background-color: #f9f9f9;`
    };

    // --- Status Styling Helper ---
    const getStatusHtml = (status) => {
        const s = status || 'N/A';
        let style = 'color: #555;';
        if (s === 'Yes') style = 'color: green; font-weight: bold;';
        if (s === 'No') style = 'color: red; font-weight: bold;';
        return `<span style="${style}">${s}</span>`;
    };

    // --- Main HTML Body Construction ---
    let html = `<div style="${styles.body}">`;
    html += `<h2 style="${styles.h2}">New Report for ${applianceName}</h2>`;
    html += `<p>A new report was completed by <strong>${username}</strong> on ${formattedDate}.</p>`;

    if (Array.isArray(sections) && sections.length > 0) {
        sections.forEach(section => {
            html += `<h3 style="${styles.h3}">${section.title || 'Untitled Section'}</h3>`;
            html += `<table style="${styles.table}">`;
            html += `<thead><tr><th style="${styles.th}">Item</th><th style="${styles.th}">Status</th><th style="${styles.th}">Notes</th></tr></thead>`;
            html += `<tbody>`;

            const items = section.items || [];
            if (Array.isArray(items) && items.length > 0) {
                items.forEach(item => {
                    // A "locker" is an item that has its own 'items' array.
                    const isLocker = item && Array.isArray(item.items) && item.items.length > 0;

                    if (isLocker) {
                        // Render the locker title row
                        html += `<tr>`;
                        html += `<td colspan="3" style="${styles.td} ${styles.locker}">${item.name || 'Unnamed Locker'}</td>`;
                        html += `</tr>`;

                        // Render the sub-items
                        item.items.forEach(subItem => {
                            html += `<tr>`;
                            html += `<td style="${styles.td} ${styles.subItem}">${subItem.name || 'Unnamed Sub-item'}</td>`;
                            html += `<td style="${styles.td}">${getStatusHtml(subItem.status)}</td>`;
                            html += `<td style="${styles.td}"><span style="${styles.notes}">${subItem.notes || ''}</span></td>`;
                            html += `</tr>`;
                        });
                    } else if (item) {
                        // Render a regular item
                        html += `<tr>`;
                        html += `<td style="${styles.td}">${item.name || 'Unnamed Item'}</td>`;
                        html += `<td style="${styles.td}">${getStatusHtml(item.status)}</td>`;
                        html += `<td style="${styles.td}"><span style="${styles.notes}">${item.notes || ''}</span></td>`;
                        html += `</tr>`;
                    }
                });
            }
            html += `</tbody></table>`;
        });
    } else {
        html += `<p>This report does not contain any checklist items.</p>`;
    }

    html += `</div>`;
    return html;
};

reportRouter.post('/', async (req, res) => {
    try {
        const reportData = req.body;
        console.log("Number of sections received:", reportData.sections ? reportData.sections.length : "sections property is missing");
        const { brigadeId, applianceId, applianceName, date, username } = reportData;
        if (!brigadeId || !applianceId || !date || !username) {
            return res.status(400).json({ message: 'Missing required report data.' });
        }
        const reportRef = db.collection('brigades').doc(brigadeId).collection('reports').doc();
        await reportRef.set(reportData);
        const reportId = reportRef.id;
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
        try {
            const membersSnapshot = await db.collection('brigades').doc(brigadeId).collection('members').get();
            if (!membersSnapshot.empty) {
                const memberIds = membersSnapshot.docs.map(doc => doc.id);
                const userPromises = memberIds.map(uid => admin.auth().getUser(uid));
                const userRecords = await Promise.all(userPromises);
                const recipients = userRecords.map(userRecord => userRecord.email).filter(email => !!email);
                if (recipients.length > 0) {
                    
                    // Generate the rich HTML content for the email
                    const emailHtml = generateReportHtml(reportData);

                    const mailCollection = db.collection('mail');
                    const emailPromises = recipients.map(email => {
                        return mailCollection.add({
                            to: email,
                            message: {
                                subject: `New Report Submitted for ${applianceName}`,
                                html: emailHtml, // Use the new, detailed HTML
                            },
                        });
                    });
                    await Promise.all(emailPromises);
                    console.log(`Successfully queued emails for ${recipients.length} brigade members.`);
                }
            }
        } catch (emailError) {
            console.error("Failed to send email notifications:", emailError);
        }
        res.status(201).json({ message: 'Report saved successfully.', reportId: reportId });
    } catch (err) {
        console.error('Error saving report:', err);
        res.status(500).json({ message: 'Error saving report.' });
    }
});
apiRouter.use('/reports', reportRouter);

// --- Final App Setup ---
app.use('/api', apiRouter);
exports.api = functions.https.onRequest(app);
