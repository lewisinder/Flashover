const express = require('express');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3000;

const dataFilePath = (username) => path.join(__dirname, `${username}_truck_data.json`);
const usersFilePath = path.join(__dirname, 'users.json');

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Redirect root to login page
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// ===================================================================
// AUTHENTICATION ROUTES
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
            // If the file doesn't exist, we'll create it.
            if (error.code !== 'ENOENT') throw error;
        }

        if (users.find(u => u.username === username)) {
            return res.status(400).json({ message: 'Username already exists.' });
        }

        users.push({ username, password }); // In a real app, hash the password!
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

        const user = users.find(u => u.username === username && u.password === password);
        if (!user) {
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
        await fs.writeFile(dataFilePath(username), JSON.stringify(req.body, null, 2));
        res.json({ message: 'Data saved successfully!' });
    } catch (err) {
        console.error('Error writing data file:', err);
        res.status(500).json({ message: 'Error saving data.' });
    }
});

// ===================================================================
// SERVER START
// ===================================================================

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
