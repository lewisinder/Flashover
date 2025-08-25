const express = require("express");
const router = express.Router({ mergeParams: true });
const admin = require('firebase-admin');
const db = admin.firestore();

// GET /api/brigades/:brigadeId/appliances/:applianceId/check-status
router.get("/:applianceId/check-status", async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const applianceRef = db.collection('brigades').doc(brigadeId).collection('appliances').doc(applianceId);
        const doc = await applianceRef.get();
        if (!doc.exists) {
            res.status(404).send('Appliance not found');
        } else {
            res.json({ checkStatus: doc.data().checkStatus || 'not-started' });
        }
    } catch (error) {
        console.error("Error fetching appliance check status:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/brigades/:brigadeId/appliances/:applianceId/start-check
router.post("/:applianceId/start-check", async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const applianceRef = db.collection('brigades').doc(brigadeId).collection('appliances').doc(applianceId);
        await applianceRef.update({ checkStatus: 'in-progress' });
        res.json({ message: `Successfully started check for appliance ${applianceId}` });
    } catch (error) {
        console.error("Error starting appliance check:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/brigades/:brigadeId/appliances/:applianceId/complete-check
router.post("/:applianceId/complete-check", async (req, res) => {
    try {
        const { brigadeId, applianceId } = req.params;
        const checkData = req.body;

        const applianceRef = db.collection('brigades').doc(brigadeId).collection('appliances').doc(applianceId);
        const newCheckRef = applianceRef.collection('checks').doc();

        await db.runTransaction(async (transaction) => {
            transaction.set(newCheckRef, checkData);
            transaction.update(applianceRef, { checkStatus: 'completed' });
        });

        res.json({ message: `Successfully completed check for appliance ${applianceId}` });
    } catch (error) {
        console.error("Error completing appliance check:", error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;