const express = require('express');
const axios = require('axios');
const router = express.Router();

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

// Strava redirects back here with a code — save tokens to session, not DB
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

        // Store tokens in this user's session — isolated per visitor
        req.session.strava = {
            access_token,
            refresh_token,
            expires_at,
            athlete_name: `${athlete.firstname} ${athlete.lastname}`
        };

        console.log(`Strava connected for athlete: ${athlete.firstname} ${athlete.lastname}`);
        res.redirect('/?connected=1');
    } catch (err) {
        console.error('Strava OAuth callback error:', err.response?.data || err.message);
        res.send('Failed to connect Strava account. Check server logs.');
    }
});

// Check if current session has Strava connected
router.get('/status', (req, res) => {
    const strava = req.session.strava;
    res.json({
        connected: !!strava,
        athlete_name: strava?.athlete_name || null
    });
});

// Disconnect — just clear this session's tokens
router.post('/disconnect', (req, res) => {
    req.session.strava = null;
    res.json({ message: 'Disconnected' });
});

module.exports = router;
