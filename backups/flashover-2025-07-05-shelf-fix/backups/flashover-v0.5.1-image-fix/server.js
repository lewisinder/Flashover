const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const multer = require('multer');

const app = express();
const port = process.env.PORT || 3000;

const dataDir = process.env.DATA_DIR || __dirname;
const reportsDir = path.join(dataDir, 'reports');
const uploadsDir = path.join(__dirname, 'public', 'uploads');

// Create data directories if they don't exist
const createDataDirs = async () => {
    await fs.mkdir(reportsDir, { recursive: true });
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.mkdir(path.join(dataDir, 'users'), { recursive: true });
};
createDataDirs();

const dataFilePath = (username) => path.join(dataDir, 'users', `${username}_truck_data.json`);
const usersFilePath = path.join(dataDir, 'users.json');


// --- Multer Configuration ---
const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: function(req, file, cb){
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits:{fileSize: 10000000} // 10MB limit
}).single('itemImage');


// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ===================================================================
// API ROUTES
// ===================================================================

app.post('/api/upload', (req, res) => {
    upload(req, res, (err) => {
        if(err){
            res.status(500).json({ message: err });
        } else {
            if(req.file == undefined){
                res.status(400).json({ message: 'No file selected!' });
            } else {
                // If an old image path is provided in the request body, delete it.
                const oldImagePath = req.body.oldImagePath;
                if (oldImagePath) {
                    try {
                        // Basic security: ensure path is within uploads
                        if (oldImagePath.startsWith('/uploads/')) {
                            const fileName = path.basename(oldImagePath);
                            const filePath = path.join(uploadsDir, fileName);
                            fs.unlink(filePath).catch(err => {
                                // Ignore errors if file not found, log others
                                if (err.code !== 'ENOENT') {
                                    console.error(`Error deleting old image ${oldImagePath}:`, err);
                                }
                            });
                        }
                    } catch (e) {
                         console.error(`Error parsing old image path ${oldImagePath}:`, e);
                    }
                }

                res.json({
                    message: 'File uploaded successfully!',
                    filePath: `/uploads/${req.file.filename}`
                });
            }
        }
    });
});

app.delete('/api/image/:fileName', async (req, res) => {
    try {
        const { fileName } = req.params;
        // Basic security: prevent path traversal
        if (fileName.includes('..')) {
            return res.status(400).json({ message: 'Invalid filename.' });
        }
        const filePath = path.join(__dirname, 'public', 'uploads', fileName);
        await fs.unlink(filePath);
        res.json({ message: 'Image deleted successfully.' });
    } catch (err) {
        if (err.code === 'ENOENT') {
            // If file doesn't exist, it might have been already deleted.
            // We can consider this a success to avoid unnecessary client-side errors.
            return res.json({ message: 'Image already deleted or not found.' });
        }
        console.error('Error deleting image:', err);
        res.status(500).json({ message: 'Error deleting image.' });
    }
});



// ===================================================================
// AUTHENTICATION ROUTES (with Password Hashing)
// ===================================================================

app.post('/api/signup', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required.' });
        }

        let users = [];
        try {
            const usersData = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(usersData);
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: 'Username already exists.' });
        }

        // Hash the password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        users.push({ username, password: hashedPassword });
        await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2));

        // Create a default truck data file for the new user
        const defaultData = { lockers: [] };
        await fs.writeFile(dataFilePath(username), JSON.stringify(defaultData, null, 2));

        res.status(201).json({ message: 'User created successfully.' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ message: 'Error creating user.' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        let users = [];
        try {
            const usersData = await fs.readFile(usersFilePath, 'utf8');
            users = JSON.parse(usersData);
        } catch (error) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Compare the provided password with the stored hash
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        res.json({ message: 'Logged in successfully', username: user.username });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Error logging in.' });
    }
});


// ===================================================================
// DATA ROUTES (Now user-specific)
// ===================================================================

app.get('/api/data/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const userFilePath = dataFilePath(username);
        
        let data;
        try {
            data = await fs.readFile(userFilePath, 'utf8');
        } catch (error) {
            if (error.code === 'ENOENT') {
                // If the user's data file doesn't exist, create it with default data
                const defaultData = { lockers: [] };
                await fs.writeFile(userFilePath, JSON.stringify(defaultData, null, 2));
                data = JSON.stringify(defaultData);
            } else {
                throw error;
            }
        }
        
        res.json(JSON.parse(data));
    } catch (err) {
        console.error('Error reading data file:', err);
        res.status(500).json({ message: 'Error loading data.' });
    }
});

app.post('/api/data/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const userFilePath = dataFilePath(username);
        const newData = req.body;

        // --- Orphaned Image Deletion Logic ---
        let oldImagePaths = new Set();
        try {
            const oldDataRaw = await fs.readFile(userFilePath, 'utf8');
            const oldData = JSON.parse(oldDataRaw);
            if (oldData.lockers) {
                oldData.lockers.forEach(locker => {
                    if (locker.shelves) {
                        locker.shelves.forEach(shelf => {
                            if (shelf.items) {
                                shelf.items.forEach(item => {
                                    if (item.image) {
                                        oldImagePaths.add(item.image);
                                    }
                                });
                            }
                        });
                    }
                });
            }
        } catch (error) {
            // If the old file doesn't exist, there are no old images to delete.
            if (error.code !== 'ENOENT') {
                console.error('Error reading old data file for image cleanup:', error);
                // We can still proceed to save the new data.
            }
        }

        let newImagePaths = new Set();
        if (newData.lockers) {
            newData.lockers.forEach(locker => {
                if (locker.shelves) {
                    locker.shelves.forEach(shelf => {
                        if (shelf.items) {
                            shelf.items.forEach(item => {
                                if (item.image) {
                                    newImagePaths.add(item.image);
                                }
                            });
                        }
                    });
                }
            });
        }

        const imagesToDelete = [...oldImagePaths].filter(path => !newImagePaths.has(path));

        for (const imagePath of imagesToDelete) {
            try {
                // Basic security: ensure path is within uploads
                if (imagePath.startsWith('/uploads/')) {
                    const fileName = path.basename(imagePath);
                    const filePath = path.join(uploadsDir, fileName);
                    await fs.unlink(filePath);
                    console.log(`Deleted orphaned image: ${filePath}`);
                }
            } catch (err) {
                // If file doesn't exist (ENOENT), we can ignore, as the goal is deletion.
                if (err.code !== 'ENOENT') {
                    console.error(`Error deleting orphaned image ${imagePath}:`, err);
                }
            }
        }
        // --- End of Deletion Logic ---

        await fs.writeFile(userFilePath, JSON.stringify(newData, null, 2));
        res.json({ message: 'Data saved successfully!' });
    } catch (err) {
        console.error('Error writing data file:', err);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

// ===================================================================
// REPORT ROUTES
// ===================================================================

app.post('/api/reports/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const report = req.body;
        // Use the ISO date from the request body for the filename
        const timestamp = new Date(report.date).toISOString();
        const reportFileName = `${username}_${timestamp}.json`;
        const reportFilePath = path.join(reportsDir, reportFileName);

        await fs.writeFile(reportFilePath, JSON.stringify(report, null, 2));
        res.status(201).json({ message: 'Report saved successfully.' });
    } catch (err) {
        console.error('Error saving report:', err);
        res.status(500).json({ message: 'Error saving report.' });
    }
});

app.get('/api/reports/:username', async (req, res) => {
    try {
        const { username } = req.params;
        const reportFiles = await fs.readdir(reportsDir);
        
        const userReports = reportFiles
            .filter(file => file.startsWith(`${username}_`))
            .map(file => {
                const timestamp = file.replace(`${username}_`, '').replace('.json', '');
                return { 
                    fileName: file, 
                    date: new Date(timestamp).toLocaleString() 
                };
            })
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json(userReports);
    } catch (err) {
        console.error('Error listing reports:', err);
        res.status(500).json({ message: 'Error listing reports.' });
    }
});

app.get('/api/report/:username/:fileName', async (req, res) => {
    try {
        const { username, fileName } = req.params;

        // Security check: ensure the requested report belongs to the user
        if (!fileName.startsWith(`${username}_`)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const filePath = path.join(reportsDir, fileName);
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

// ===================================================================
// SERVER START
// ===================================================================

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});