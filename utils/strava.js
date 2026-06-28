const axios = require('axios');
const pool = require('./db');

// Get the stored tokens from the database
async function getTokens() {
    const [rows] = await pool.query('SELECT * FROM strava_tokens ORDER BY id DESC LIMIT 1');
    return rows[0] || null;
}

// Save new tokens to the database (replace existing row)
async function saveTokens(accessToken, refreshToken, expiresAt) {
    await pool.query('DELETE FROM strava_tokens');
    await pool.query(
        'INSERT INTO strava_tokens (access_token, refresh_token, expires_at) VALUES (?, ?, ?)',
        [accessToken, refreshToken, expiresAt]
    );
}

// Return a valid access token, refreshing first if expired
async function getValidAccessToken() {
    const tokens = await getTokens();

    if (!tokens) {
        throw new Error('No Strava tokens found. Please connect your Strava account first.');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);

    // Refresh if token expires within the next 5 minutes
    if (tokens.expires_at - nowSeconds < 300) {
        try {
            const response = await axios.post('https://www.strava.com/oauth/token', {
                client_id: process.env.STRAVA_CLIENT_ID,
                client_secret: process.env.STRAVA_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token
            });

            const { access_token, refresh_token, expires_at } = response.data;
            await saveTokens(access_token, refresh_token, expires_at);
            return access_token;
        } catch (err) {
            const detail = err.response?.data || err.message;
            console.error('Token refresh failed:', detail);
            throw new Error(`Token refresh failed: ${JSON.stringify(detail)}`);
        }
    }

    return tokens.access_token;
}

module.exports = { getTokens, saveTokens, getValidAccessToken };
