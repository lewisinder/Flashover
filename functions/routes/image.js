const express = require("express");
const router = express.Router();
const admin = require('firebase-admin');

// DELETE /api/image/:fileName
router.delete("/:fileName", async (req, res) => {
    try {
        const { fileName } = req.params;
        const bucket = admin.storage().bucket();
        const file = bucket.file(`uploads/${fileName}`);
        await file.delete();
        res.json({ message: `Successfully deleted image ${fileName}` });
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;