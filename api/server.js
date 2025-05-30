const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// Enable CORS
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
    user: 'user',
    host: 'localhost',
    database: 'LifeQual_DB',
    password: 'password',
    port: 5432,
});

// Helper function to calculate distance between two points
const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
};

// Get nearby transport stops
app.get('/api/transport-stops', async (req, res) => {
    try {
        const { lat, lng, radius = 500 } = req.query;
        const result = await pool.query(`
            SELECT name, coordinates, properties
            FROM transport_stops
            WHERE ST_DWithin(
                coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
        `, [lng, lat, radius]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get nearby parks
app.get('/api/parks', async (req, res) => {
    try {
        const { lat, lng, radius = 1000 } = req.query;
        const result = await pool.query(`
            SELECT name, coordinates, polygon_coordinates, properties
            FROM parks
            WHERE ST_DWithin(
                coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
        `, [lng, lat, radius]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get nearby hospitals
app.get('/api/hospitals', async (req, res) => {
    try {
        const { lat, lng, radius = 5000 } = req.query;
        const result = await pool.query(`
            SELECT name, coordinates, properties
            FROM hospitals
            WHERE ST_DWithin(
                coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
        `, [lng, lat, radius]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get crime stats for a district
app.get('/api/crime-stats/:district', async (req, res) => {
    try {
        const { district } = req.params;
        const result = await pool.query(`
            SELECT district, crimes, year
            FROM crime_stats
            WHERE district ILIKE $1
        `, [district]);
        res.json(result.rows[0] || { error: 'District not found' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get nearby schools
app.get('/api/schools', async (req, res) => {
    try {
        const { lat, lng, radius = 3000 } = req.query;
        const result = await pool.query(`
            SELECT name, coordinates, properties
            FROM schools
            WHERE ST_DWithin(
                coordinates::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3
            )
        `, [lng, lat, radius]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get rent price for a district
app.get('/api/rent-prices/:district', async (req, res) => {
    try {
        const { district } = req.params;
        const result = await pool.query(`
            SELECT district, price_per_sqm
            FROM rent_prices
            WHERE district ILIKE $1
        `, [district]);
        res.json(result.rows[0] || { error: 'District not found' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.listen(port, () => {
    console.log(`API server running at http://localhost:${port}`);
}); 