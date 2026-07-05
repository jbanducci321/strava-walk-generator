require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');

const activityRoutes = require('./routes/activity');
const downloadRoutes = require('./routes/download');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/activity', activityRoutes);
app.use('/api/download', downloadRoutes);
app.use('/auth', authRoutes);

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
