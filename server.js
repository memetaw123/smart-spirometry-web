const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi Database dengan Connection Pool
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT) : 11614,
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Otomatisasi Tabel Database
function createTablesAutomatically() {
    const createTestLogs = `
        CREATE TABLE IF NOT EXISTS test_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            patient_id INT DEFAULT 1,
            device_id VARCHAR(50) DEFAULT 'SPIRO-01',
            pressure FLOAT NOT NULL,
            zone_status VARCHAR(20) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    db.query(createTestLogs, (err) => {
        if (err) console.error("Error table test_logs:", err);
        else console.log("✅ Tabel database siap digunakan!");
    });
}
createTablesAutomatically();

// Endpoint Menerima Data dari ESP8266 (POST)
app.post('/api/data', (req, res) => {
    const { device_id, pressure, status } = req.body;
    const query = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (1, ?, ?, ?)';
    db.query(query, [device_id || 'SPIRO-01', pressure || 0, status || 'Zona Merah'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Data sukses disimpan!' });
    });
});

// Endpoint Mengambil Riwayat untuk Web (GET)
app.get('/api/history', (req, res) => {
    const query = 'SELECT * FROM test_logs ORDER BY created_at DESC LIMIT 10';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Endpoint Reset Database (DELETE)
app.delete('/api/reset', (req, res) => {
    const query = 'TRUNCATE TABLE test_logs';
    db.query(query, (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Riwayat data berhasil dikosongkan!' });
    });
});

app.get('/*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});
