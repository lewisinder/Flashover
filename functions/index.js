const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

admin.initializeApp();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({
    extended: true,
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Import routes
const brigadeRoutes = require('./routes/brigade');
const reportRoutes = require('./routes/reports');
const dataRoutes = require('./routes/data');
const uploadRoutes = require('./routes/upload');
const imageRoutes = require('./routes/image');


// Use routes
app.use('/api/brigades', brigadeRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/image', imageRoutes);

// Simple route for testing
app.get("/api", (req, res) => {
  res.send("Flashover API is running!");
});

// Expose Express API as a single Cloud Function
exports.api = functions.https.onRequest(app);