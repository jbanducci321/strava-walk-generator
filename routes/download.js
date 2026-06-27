const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const router = express.Router();
const pool = require('../utils/db');
const { buildGpx } = require('../utils/gpx');
const { getValidAccessToken } = require('../utils/strava');

// Generate and download a GPX file
router.post('/gpx', async (req, res) => {
    const { coordinates, name, sport_type, start_time, duration_seconds, route_id } = req.body;

    if (!coordinates || !coordinates.length) {
        return res.status(400).json({ error: 'Coordinates are required' });
    }

    if (!start_time || !duration_seconds) {
        return res.status(400).json({ error: 'Start time and duration are required' });
    }

    try {
        const gpx = buildGpx(coordinates, {
            name: name || 'My Walk',
            sportType: sport_type || 'Walk',
            startTime: start_time,
            durationSeconds: parseInt(duration_seconds)
        });

        // Log the export to the database
        try {
            const distanceKm = req.body.distance_km || null;
            const distanceMi = distanceKm ? distanceKm * 0.621371 : null;
            const avgSpeed = distanceMi
                ? (distanceMi / (parseInt(duration_seconds) / 3600)).toFixed(2)
                : null;

            await pool.query(`
                INSERT INTO activity_exports
                    (route_id, start_time, duration_seconds, avg_speed_kmh, notes)
                VALUES (?, ?, ?, ?, ?)
            `, [
                route_id || null,
                new Date(start_time),
                parseInt(duration_seconds),
                avgSpeed,
                name || null
            ]);
        } catch (dbErr) {
            // Don't block the download if logging fails
            console.error('Export log error:', dbErr.message);
        }

        const filename = `${(name || 'walk').replace(/\s+/g, '_')}.gpx`;

        res.setHeader('Content-Type', 'application/gpx+xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(gpx);
    } catch (err) {
        console.error('GPX generation error:', err.message);
        res.status(500).json({ error: 'Failed to generate GPX file' });
    }
});

// Upload activity directly to Strava
router.post('/upload-strava', async (req, res) => {
    const { coordinates, name, sport_type, start_time, duration_seconds, distance_km, route_id } = req.body;

    if (!coordinates || !coordinates.length) {
        return res.status(400).json({ error: 'Coordinates are required' });
    }

    if (!start_time || !duration_seconds) {
        return res.status(400).json({ error: 'Start time and duration are required' });
    }

    try {
        const accessToken = await getValidAccessToken();

        const gpx = buildGpx(coordinates, {
            name: name || 'My Walk',
            sportType: sport_type || 'Walk',
            startTime: start_time,
            durationSeconds: parseInt(duration_seconds)
        });

        // Build multipart form for Strava upload
        const form = new FormData();
        form.append('file', Buffer.from(gpx), {
            filename: `${(name || 'walk').replace(/\s+/g, '_')}.gpx`,
            contentType: 'application/gpx+xml'
        });
        form.append('data_type', 'gpx');
        form.append('name', name || 'My Walk');
        form.append('sport_type', sport_type || 'Walk');

        const uploadRes = await axios.post(
            'https://www.strava.com/api/v3/uploads',
            form,
            {
                headers: {
                    ...form.getHeaders(),
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        const uploadId = uploadRes.data.id;

        // Poll Strava until processing is complete (up to ~15 seconds)
        let activityId = null;
        for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 1500));

            const statusRes = await axios.get(
                `https://www.strava.com/api/v3/uploads/${uploadId}`,
                { headers: { 'Authorization': `Bearer ${accessToken}` } }
            );

            const status = statusRes.data;

            if (status.error) {
                return res.status(400).json({ error: `Strava rejected the upload: ${status.error}` });
            }

            if (status.activity_id) {
                activityId = status.activity_id;
                break;
            }
        }

        // Log the export to the database
        try {
            const distanceMi = distance_km ? distance_km * 0.621371 : null;
            const avgSpeed = distanceMi
                ? (distanceMi / (parseInt(duration_seconds) / 3600)).toFixed(2)
                : null;

            await pool.query(`
                INSERT INTO activity_exports
                    (route_id, start_time, duration_seconds, avg_speed_kmh, notes)
                VALUES (?, ?, ?, ?, ?)
            `, [
                route_id || null,
                new Date(start_time),
                parseInt(duration_seconds),
                avgSpeed,
                name || null
            ]);
        } catch (dbErr) {
            console.error('Export log error:', dbErr.message);
        }

        res.json({
            success: true,
            activity_id: activityId,
            strava_url: activityId ? `https://www.strava.com/activities/${activityId}` : null
        });
    } catch (err) {
        console.error('Strava upload error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Failed to upload to Strava' });
    }
});

module.exports = router;
