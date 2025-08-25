const express = require("express");
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

// GET /api/reports/brigade/:brigadeId
router.get("/brigade/:brigadeId", async (req, res) => {
    try {
        const { brigadeId } = req.params;
        const reportsRef = db.collection('reports');
        const snapshot = await reportsRef.where('brigadeId', '==', brigadeId).get();
        if (snapshot.empty) {
            return res.json([]);
        }
        const reports = [];
        snapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });
        res.json(reports);
    } catch (error) {
        console.error("Error fetching reports by brigade:", error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/reports/:reportId
router.get("/:reportId", async (req, res) => {
    try {
        const { reportId } = req.params;
        const reportRef = db.collection('reports').doc(reportId);
        const doc = await reportRef.get();
        if (!doc.exists) {
            res.status(404).send('Report not found');
        } else {
            res.json({ id: doc.id, ...doc.data() });
        }
    } catch (error) {
        console.error("Error fetching report:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/reports
router.post("/", async (req, res) => {
    try {
        const reportData = req.body;
        const docRef = await db.collection('reports').add(reportData);
        res.status(201).json({ id: docRef.id, ...reportData });
    } catch (error) {
        console.error("Error creating report:", error);
        res.status(500).send('Internal Server Error');
    }
});

// GET /api/reports/user/:userId
router.get("/user/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const reportsRef = db.collection('reports');
        const snapshot = await reportsRef.where('userId', '==', userId).get();
        if (snapshot.empty) {
            return res.json([]);
        }
        const reports = [];
        snapshot.forEach(doc => {
            reports.push({ id: doc.id, ...doc.data() });
        });
        res.json(reports);
    } catch (error) {
        console.error("Error fetching reports by user:", error);
        res.status(500).send('Internal Server Error');
    }
});

// DELETE /api/reports/:reportId
router.delete("/:reportId", async (req, res) => {
    try {
        const { reportId } = req.params;
        const reportRef = db.collection('reports').doc(reportId);
        await reportRef.delete();
        res.json({ message: `Successfully deleted report ${reportId}` });
    } catch (error) {
        console.error("Error deleting report:", error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;