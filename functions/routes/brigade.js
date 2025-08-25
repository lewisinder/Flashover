const express = require("express");
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

// GET /api/brigades/:brigadeId
router.get("/:brigadeId", async (req, res) => {
  try {
    const { brigadeId } = req.params;
    const brigadeRef = db.collection('brigades').doc(brigadeId);
    const doc = await brigadeRef.get();
    if (!doc.exists) {
      res.status(404).send('Brigade not found');
    } else {
      res.json(doc.data());
    }
  } catch (error) {
    console.error("Error fetching brigade data:", error);
    res.status(500).send('Internal Server Error');
  }
});

// GET /api/brigades/:brigadeId/data
router.get("/:brigadeId/data", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        const brigadeDoc = await brigadeRef.get();

        if (!brigadeDoc.exists) {
            return res.status(404).send('Brigade not found');
        }

        const brigadeData = brigadeDoc.data();
        const appliancesRef = brigadeRef.collection('appliances');
        const appliancesSnapshot = await appliancesRef.get();

        const appliances = [];
        appliancesSnapshot.forEach(doc => {
            appliances.push({ id: doc.id, ...doc.data() });
        });

        res.json({ ...brigadeData, appliances });
    } catch (error) {
        console.error("Error fetching brigade data and appliances:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/brigades/:brigadeId/data
router.post("/:brigadeId/data", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const brigadeData = req.body;

        // This implementation does not handle appliance updates.
        // It only updates the brigade document.
        const brigadeRef = db.collection('brigades').doc(brigadeId);
        await brigadeRef.update(brigadeData);

        res.json({ message: `Successfully updated data for brigade ${brigadeId}` });
    } catch (error) {
        console.error("Error updating brigade data:", error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/brigades/:brigadeId/join-requests
router.get("/:brigadeId/join-requests", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const joinRequestsRef = db.collection('brigades').doc(brigadeId).collection('join-requests');
        const snapshot = await joinRequestsRef.get();
        const joinRequests = [];
        snapshot.forEach(doc => {
            joinRequests.push({ id: doc.id, ...doc.data() });
        });
        res.json(joinRequests);
    } catch (error) {
        console.error("Error fetching join requests:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/brigades/:brigadeId/join-requests/:userId
router.post("/:brigadeId/join-requests/:userId", async (req, res) => {
    try {
        const { brigadeId, userId } = req.params;
        const { action } = req.body; // action: 'approve' or 'deny'

        const joinRequestRef = db.collection('brigades').doc(brigadeId).collection('join-requests').doc(userId);

        if (action === 'approve') {
            const joinRequestDoc = await joinRequestRef.get();
            if (!joinRequestDoc.exists) {
                return res.status(404).send('Join request not found');
            }
            const userData = joinRequestDoc.data();

            const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);

            await db.runTransaction(async (transaction) => {
                transaction.set(memberRef, userData);
                transaction.delete(joinRequestRef);
            });

            res.json({ message: `User ${userId} approved and added to members` });

        } else if (action === 'deny') {
            await joinRequestRef.delete();
            res.json({ message: `User ${userId} join request denied` });
        } else {
            res.status(400).send('Invalid action');
        }
    } catch (error) {
        console.error("Error processing join request:", error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/brigades/:brigadeId/members
router.get("/:brigadeId/members", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const membersRef = db.collection('brigades').doc(brigadeId).collection('members');
        const snapshot = await membersRef.get();
        const members = [];
        snapshot.forEach(doc => {
            members.push({ id: doc.id, ...doc.data() });
        });
        res.json(members);
    } catch (error) {
        console.error("Error fetching members:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/brigades/:brigadeId/members
router.post("/:brigadeId/members", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const memberData = req.body;
        const { userId } = memberData;

        if (!userId) {
            return res.status(400).send('userId is required');
        }

        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(userId);
        await memberRef.set(memberData);

        res.json({ message: `Successfully added member ${userId} to brigade ${brigadeId}` });
    } catch (error) {
        console.error("Error adding member:", error);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE /api/brigades/:brigadeId/members/:memberId
router.delete("/:brigadeId/members/:memberId", async (req, res) => {
    try {
        const { brigadeId, memberId } = req.params;
        const memberRef = db.collection('brigades').doc(brigadeId).collection('members').doc(memberId);
        await memberRef.delete();
        res.json({ message: `Successfully removed member ${memberId} from brigade ${brigadeId}` });
    } catch (error) {
        console.error("Error removing member:", error);
        res.status(500).send('Internal Server Error');
    }
});

const applianceChecksRouter = require('./appliance-checks');
router.use('/:brigadeId/appliances', applianceChecksRouter);

module.exports = router;
