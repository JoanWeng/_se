const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/', (req, res) => {
  res.json({ service: 'api-node', runtime: 'Node.js ' + process.version, message: 'Hello from Node.js!' });
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ service: 'api-node', status: 'ok', db: 'connected', time: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ service: 'api-node', status: 'error', db: String(e.message) });
  }
});

app.get('/api/users', async (req, res) => {
  try {
    await pool.query("INSERT INTO visits (service) VALUES ('api-node')");
    const { rows } = await pool.query('SELECT * FROM visits ORDER BY id DESC LIMIT 5');
    res.json({ service: 'api-node', count: rows.length, visits: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

app.listen(PORT, '0.0.0.0', () => console.log(`api-node listening on ${PORT}`));
