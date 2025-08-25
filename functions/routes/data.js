const express = require("express");
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore();

// GET /api/data/:userId
router.get("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const userRef = db.collection('users').doc(userId);
        const doc = await userRef.get();
        if (!doc.exists) {
            res.status(404).send('User not found');
        } else {
            res.json({ id: doc.id, ...doc.data() });
        }
    } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).send('Internal Server Error');
    }
});

// POST /api/data/:userId
router.post("/:userId", async (req, res) => {
    try {
        const { userId } = req.params;
        const userData = req.body;
        const userRef = db.collection('users').doc(userId);
        await userRef.set(userData, { merge: true }); // Use merge to update existing fields or create if not exists
        res.json({ message: `Successfully saved data for user ${userId}` });
    } catch (error) {
        console.error("Error saving user data:", error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;