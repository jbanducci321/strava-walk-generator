const express = require('express');
const axios = require('axios');
const router = express.Router();
const { saveTokens, getTokens } = require('../utils/strava');

// Temporary: show the OAuth URL instead of redirecting so we can verify it
router.get('/strava-debug', (req, res) => {
    const redirectUri = process.env.STRAVA_REDIRECT_URI ||
        `${req.protocol}://${req.get('host')}/auth/callback`;

    const params = new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        approval_prompt: 'auto',
        scope: 'activity:write,read'
    });

    res.json({
        redirect_uri_being_sent: redirectUri,
        full_oauth_url: `https://www.strava.com/oauth/authorize?${params}`
    });
});

// Redirect user to Strava to authorize
router.get('/strava', (req, res) => {
    const redirectUri = process.env.STRAVA_REDIRECT_URI ||
        `${req.protocol}://${req.get('host')}/auth/callback`;

    const params = new URLSearchParams({
        client_id: process.env.STRAVA_CLIENT_ID,
        response_type: 'code',
        redirect_uri: redirectUri,
        approval_prompt: 'auto',
        scope: 'activity:write,read'
    });

    res.redirect(`https://www.strava.com/oauth/authorize?${params}`);
});

// Strava redirects back here with a code
router.get('/callback', async (req, res) => {
    const { code, error } = req.query;

    if (error || !code) {
        return res.send('Strava authorization was denied or failed.');
    }

    try {
        const redirectUri = process.env.STRAVA_REDIRECT_URI ||
            `${req.protocol}://${req.get('host')}/auth/callback`;

        const response = await axios.post('https://www.strava.com/oauth/token', {
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri
        });

        const { access_token, refresh_token, expires_at, athlete } = response.data;
        await saveTokens(access_token, refresh_token, expires_at);

        console.log(`Strava connected for athlete: ${athlete.firstname} ${athlete.lastname}`);
        res.redirect('/?connected=1');
    } catch (err) {
        console.error('Strava OAuth callback error:', err.response?.data || err.message);
        res.send('Failed to connect Strava account. Check server logs.');
    }
});

// One-time seed: loads tokens from .env directly into the DB
// Visit /auth/seed once after deploy, then this route does nothing further
router.get('/seed', async (req, res) => {
    const accessToken = process.env.STRAVA_ACCESS_TOKEN;
    const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

    if (!accessToken || !refreshToken) {
        return res.status(400).json({ error: 'STRAVA_ACCESS_TOKEN or STRAVA_REFRESH_TOKEN not set in env' });
    }

    try {
        // Set expires_at to 0 so the refresh logic kicks in on first upload attempt
        await saveTokens(accessToken, refreshToken, 0);
        res.json({ success: true, message: 'Tokens seeded. Strava is now connected.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Check if Strava is currently connected
router.get('/status', async (req, res) => {
    try {
        const tokens = await getTokens();
        res.json({ connected: !!tokens });
    } catch (err) {
        res.json({ connected: false });
    }
});

// Disconnect Strava (removes stored tokens)
router.post('/disconnect', async (req, res) => {
    const pool = require('../utils/db');
    await pool.query('DELETE FROM strava_tokens');
    res.json({ message: 'Disconnected' });
});

module.exports = router;
