const express = require('express');
const router = express.Router();
const pool = require('../utils/db');
const { buildGpx } = require('../utils/gpx');

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
            const avgSpeed = distanceKm
                ? ((distanceKm / (parseInt(duration_seconds) / 3600)).toFixed(2))
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

module.exports = router;
