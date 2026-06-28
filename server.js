require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const activityRoutes = require('./routes/activity');
const downloadRoutes = require('./routes/download');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Basic auth password gate
app.use((req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (authHeader) {
        const base64 = authHeader.split(' ')[1];
        const [username, password] = Buffer.from(base64, 'base64').toString().split(':');

        if (username === process.env.APP_USERNAME && password === process.env.APP_PASSWORD) {
            return next();
        }
    }

    res.set('WWW-Authenticate', 'Basic realm="Strava Walk Generator"');
    res.status(401).send('Unauthorized');
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/activity', activityRoutes);
app.use('/api/download', downloadRoutes);
app.use('/auth', authRoutes);

// Temporary diagnostic route — remove after confirming env vars are set on Render
app.get('/debug-env', (req, res) => {
    res.json({
        ORS_API_KEY: !!process.env.ORS_API_KEY,
        STRAVA_CLIENT_ID: !!process.env.STRAVA_CLIENT_ID,
        STRAVA_REDIRECT_URI: process.env.STRAVA_REDIRECT_URI || 'NOT SET',
        DB_USERNAME: !!process.env.DB_USERNAME,
        PORT: process.env.PORT
    });
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
