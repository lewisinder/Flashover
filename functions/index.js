const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const os = require('os');
const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const sharp = require('sharp');
const Busboy = require('busboy');

// --- Firebase Admin SDK Initialization ---
admin.initializeApp();

// --- SMTP Initialization (Gmail/Outlook via nodemailer) ---
const smtpConfig = functions.config().smtp || {};
const transporter = nodemailer.createTransport({
  host: smtpConfig.host,
  port: Number(smtpConfig.port),
  secure: Number(smtpConfig.port) === 465,
  auth: {
    user: smtpConfig.user,
    pass: smtpConfig.pass,
  },
});
const DEFAULT_FROM_EMAIL = smtpConfig.from || "hello@theblueprintcollective.co.nz";

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
        await transporter.sendMail(msg);
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
// A helper function to generate a clearer HTML email for the report
const generateReportHtml = (reportData) => {
    const { applianceName = 'Unknown Appliance', date, username = 'Unknown User', lockers = [] } = reportData || {};

    let formattedDate = 'an unknown date';
    try {
        if (date) {
            formattedDate = new Date(date).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland' });
        }
    } catch (e) {
        console.error('Could not parse date:', date);
    }

    const styles = {
        body: `font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2933; background: #f7f9fc; padding: 16px;`,
        card: `max-width: 720px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.04); padding: 20px;`,
        header: `margin: 0 0 12px 0; color: #111827;`,
        sub: `margin: 4px 0 16px 0; color: #4b5563;`,
        summary: `display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px 0;`,
        pill: `background: #e5e7eb; border-radius: 999px; padding: 6px 10px; font-size: 13px; color: #111827;`,
        section: `margin: 16px 0; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;`,
        sectionHeader: `background: #111827; padding: 12px 14px; font-weight: 800; color: #ffffff; font-size: 15px; letter-spacing: 0.2px;`,
        table: `width: 100%; border-collapse: collapse;`,
        td: `padding: 10px 14px; font-size: 14px; color: #111827; border-bottom: 1px solid #eef2f7; vertical-align: top;`,
        name: `font-weight: 700;`,
        subtle: `color: #6b7280; font-weight: 600; font-size: 12px;`,
        note: `display: inline-block; background: #fff7ed; color: #9a3412; padding: 4px 8px; border-radius: 8px; font-size: 13px; border: 1px solid #fed7aa;`,
        rowAlt: `background: #fafbfc;`,
        rowIssue: `background: #fff5f5;`,
        rowContainer: `background: #f2f6ff;`,
        rowSubItem: `background: #f8fafc;`,
        subItemPad: `padding-left: 36px;`,
        statusTagBase: `display: inline-block; width: 6px; height: 14px; border-radius: 999px; margin-right: 10px; vertical-align: -2px;`,
        statusTag: {
            present: `background: #22c55e;`,
            missing: `background: #ef4444;`,
            defect: `background: #ef4444;`,
            untouched: `background: #6366f1;`,
            na: `background: #9ca3af;`,
        },
        badge: {
            base: `display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 700;`,
            present: `background: #ecfdf3; color: #166534; border: 1px solid #bbf7d0;`,
            missing: `background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3;`,
            defect: `background: #fef2f2; color: #b91c1c; border: 1px solid #fecdd3;`,
            untouched: `background: #eef2ff; color: #312e81; border: 1px solid #c7d2fe;`,
            na: `background: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;`
        }
    };

    const statusBadge = (status) => {
        const s = (status || 'N/A').toLowerCase();
        let style = styles.badge.na;
        let label = 'N/A';
        if (s === 'present') { style = styles.badge.present; label = 'Present'; }
        else if (s === 'missing') { style = styles.badge.missing; label = 'Missing'; }
        else if (s === 'defect') { style = styles.badge.defect; label = 'Defect'; }
        else if (s === 'untouched') { style = styles.badge.untouched; label = 'Untouched'; }
        return `<span style="${styles.badge.base} ${style}">${label}</span>`;
    };

    const isIssueStatus = (status) => {
        const s = (status || '').toLowerCase();
        return s === 'missing' || s === 'defect';
    };

    const effectiveContainerStatus = (item) => {
        const type = (item && item.type || '').toLowerCase();
        if (type !== 'container') return item && item.status;

        const raw = (item && item.status || 'untouched').toLowerCase();
        if (raw === 'missing' || raw === 'defect') return raw;

        // In the app UX, "check contents" implies the container itself is present,
        // even if the container item wasn't explicitly marked.
        return 'present';
    };

    const statusTagHtml = (status) => {
        const s = (status || 'N/A').toLowerCase();
        let style = styles.statusTag.na;
        if (s === 'present') style = styles.statusTag.present;
        else if (s === 'missing') style = styles.statusTag.missing;
        else if (s === 'defect') style = styles.statusTag.defect;
        else if (s === 'untouched') style = styles.statusTag.untouched;
        return `<span style="${styles.statusTagBase} ${style}"></span>`;
    };

    let issuesCount = 0;
    if (Array.isArray(lockers)) {
        lockers.forEach(locker => {
            (locker.shelves || []).forEach(shelf => {
                (shelf.items || []).forEach(item => {
                    const s = (item && item.status || '').toLowerCase();
                    if (s === 'missing' || s === 'defect') issuesCount += 1;
                    (item && item.subItems || []).forEach(sub => {
                        const ss = (sub && sub.status || '').toLowerCase();
                        if (ss === 'missing' || ss === 'defect') issuesCount += 1;
                    });
                });
            });
        });
    }

    let html = `<div style="${styles.body}"><div style="${styles.card}">`;
    html += `<h2 style="${styles.header}">Report for ${applianceName}</h2>`;
    html += `<p style="${styles.sub}">Completed by <strong>${username}</strong> on ${formattedDate}</p>`;
    html += `<div style="${styles.summary}">`;
    html += `<span style="${styles.pill}">Issues: ${issuesCount}</span>`;
    html += `<span style="${styles.pill}">Lockers: ${Array.isArray(lockers) ? lockers.length : 0}</span>`;
    html += `</div>`;

    if (Array.isArray(lockers) && lockers.length > 0) {
        lockers.forEach(locker => {
            html += `<div style="${styles.section}">`;
            html += `<div style="${styles.sectionHeader}">${locker.name || 'Locker'}</div>`;

            const shelves = locker.shelves || [];
            if (shelves.length === 0) {
                html += `<div style="padding: 12px 14px; color: #6b7280; font-size: 13px;">No items recorded.</div>`;
            } else {
                html += `<table style="${styles.table}"><tbody>`;

                const orderedItems = shelves.flatMap((shelf) => Array.isArray(shelf.items) ? shelf.items : []);
                orderedItems.forEach((item, itemIndex) => {
                    if (!item) return;

                    const status = effectiveContainerStatus(item);
                    const itemIsIssue = isIssueStatus(status);
                    const rowStyleParts = [];
                    if (itemIndex % 2 === 1) rowStyleParts.push(styles.rowAlt);
                    if (itemIsIssue) rowStyleParts.push(styles.rowIssue);
                    if ((item.type || '').toLowerCase() === 'container') rowStyleParts.push(styles.rowContainer);
                    const rowStyle = rowStyleParts.length ? ` style="${rowStyleParts.join(' ')}"` : '';

                    const noteHtml = item.note ? `<span style="${styles.note}">${item.note}</span>` : '';
                    const tagHtml = statusTagHtml(status);

                    html += `<tr${rowStyle}>`;
                    html += `<td style="${styles.td}">${tagHtml}<span style="${styles.name}">${item.name || 'Item'}</span></td>`;
                    html += `<td style="${styles.td}">${statusBadge(status)}</td>`;
                    html += `<td style="${styles.td}">${noteHtml}</td>`;
                    html += `</tr>`;

                    if (item.type === 'container' && Array.isArray(item.subItems) && item.subItems.length > 0) {
                        item.subItems.forEach((sub, subIndex) => {
                            if (!sub) return;
                            const subIsIssue = isIssueStatus(sub.status);
                            const subRowStyleParts = [styles.rowSubItem];
                            if (subIsIssue) subRowStyleParts.push(styles.rowIssue);
                            if ((subIndex + itemIndex) % 2 === 1) subRowStyleParts.push(styles.rowAlt);
                            const subRowStyle = ` style="${subRowStyleParts.join(' ')}"`;
                            const subNoteHtml = sub.note ? `<span style="${styles.note}">${sub.note}</span>` : '';
                            const subTagHtml = statusTagHtml(sub.status);
                            html += `<tr${subRowStyle}>`;
                            html += `<td style="${styles.td} ${styles.subItemPad}"><span style="${styles.subtle}">↳</span> ${subTagHtml}<span style="${styles.name}">${sub.name || 'Sub-item'}</span></td>`;
                            html += `<td style="${styles.td}">${statusBadge(sub.status)}</td>`;
                            html += `<td style="${styles.td}">${subNoteHtml}</td>`;
                            html += `</tr>`;
                        });
                    }
                });

                html += `</tbody></table>`;
            }
            html += `</div>`;
        });
    } else {
        html += `<p>No checklist items in this report.</p>`;
    }

    html += `</div></div>`;
    return html;
};

reportRouter.post('/', async (req, res) => {
    try {
        const reportData = req.body;
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
