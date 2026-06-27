const express = require('express');
const axios = require('axios');
const router = express.Router();
const pool = require('../utils/db');

// Geocode an address or zip code to lat/lng using Nominatim
router.get('/geocode', async (req, res) => {
    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
                q: query,
                format: 'json',
                limit: 1
            },
            headers: {
                'User-Agent': 'StravaWalkGenerator/1.0'
            }
        });

        if (!response.data.length) {
            return res.status(404).json({ error: 'Location not found' });
        }

        const { lat, lon, display_name } = response.data[0];
        res.json({ lat: parseFloat(lat), lon: parseFloat(lon), display_name });
    } catch (err) {
        console.error('Geocode error:', err.message);
        res.status(500).json({ error: 'Geocoding failed' });
    }
});

// Snap drawn points to real roads/paths using OpenRouteService
router.post('/snap-route', async (req, res) => {
    const { coordinates } = req.body;

    if (!coordinates || coordinates.length < 2) {
        return res.status(400).json({ error: 'At least 2 coordinates required' });
    }

    try {
        // ORS expects [lon, lat] order
        const orsCoords = coordinates.map(c => [c[1], c[0]]);

        const response = await axios.post(
            'https://api.openrouteservice.org/v2/directions/foot-walking/geojson',
            { coordinates: orsCoords },
            {
                headers: {
                    'Authorization': process.env.ORS_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        const routeCoords = response.data.features[0].geometry.coordinates;
        const distanceMeters = response.data.features[0].properties.summary.distance;

        // Convert back to [lat, lon] for Leaflet
        const snapped = routeCoords.map(c => [c[1], c[0]]);

        res.json({
            coordinates: snapped,
            distance_km: (distanceMeters / 1000).toFixed(3)
        });
    } catch (err) {
        console.error('Snap route error:', err.response?.data || err.message);
        res.status(500).json({ error: 'Route snapping failed' });
    }
});

// Save a route to the database
router.post('/save-route', async (req, res) => {
    const { name, sport_type, coordinates, distance_km } = req.body;

    if (!name || !coordinates || !coordinates.length) {
        return res.status(400).json({ error: 'Name and coordinates are required' });
    }

    try {
        const sql = `
            INSERT INTO routes (name, sport_type, coordinates, distance_km)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await pool.query(sql, [
            name,
            sport_type || 'Walk',
            JSON.stringify(coordinates),
            distance_km || null
        ]);

        res.json({ id: result.insertId, message: 'Route saved' });
    } catch (err) {
        console.error('Save route error:', err.message);
        res.status(500).json({ error: 'Failed to save route' });
    }
});

// Get all saved routes
router.get('/routes', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, sport_type, distance_km, created_at
            FROM routes
            ORDER BY created_at DESC
        `);
        res.json(rows);
    } catch (err) {
        console.error('Get routes error:', err.message);
        res.status(500).json({ error: 'Failed to fetch routes' });
    }
});

// Get a single saved route by ID
router.get('/routes/:id', async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT * FROM routes WHERE id = ?',
            [req.params.id]
        );

        if (!rows.length) {
            return res.status(404).json({ error: 'Route not found' });
        }

        const route = rows[0];
        route.coordinates = JSON.parse(route.coordinates);
        res.json(route);
    } catch (err) {
        console.error('Get route error:', err.message);
        res.status(500).json({ error: 'Failed to fetch route' });
    }
});

module.exports = router;
