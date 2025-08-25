const express = require("express");
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.firestore(); // Although not directly used in this file, it's common to have it
const Busboy = require('busboy');
const path = require('path');
const os = require('os');
const fs = require('fs');

// POST /api/upload
router.post("/", (req, res) => {
    const busboy = Busboy({ headers: req.headers });
    let uploadFile = {};

    busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        const filepath = path.join(os.tmpdir(), filename.filename);
        uploadFile = { filepath, mimetype, filename: filename.filename };
        file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on('finish', async () => {
        try {
            const bucket = admin.storage().bucket();
            await bucket.upload(uploadFile.filepath, {
                destination: `uploads/${uploadFile.filename}`,
                metadata: {
                    contentType: uploadFile.mimetype,
                },
            });
            fs.unlinkSync(uploadFile.filepath); // Delete local temp file

            const fileRef = bucket.file(`uploads/${uploadFile.filename}`);
            const [url] = await fileRef.getSignedUrl({
                action: 'read',
                expires: '03-09-2491', // A far future date
            });

            res.json({ message: "File uploaded successfully", url });
        } catch (error) {
            console.error("Error uploading file:", error);
            res.status(500).send('Internal Server Error');
        }
    });

    busboy.end(req.rawBody);
});

module.exports = router;