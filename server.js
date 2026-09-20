const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Mengarahkan folder public agar file index.html terbaca
app.use(express.static(path.join(__dirname, 'public')));

// Menggunakan createPool agar koneksi otomatis dibuka kembali di Vercel
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

// Pembuatan tabel otomatis jika belum ada di database Aiven
function createTablesAutomatically() {
    const createPatients = `
        CREATE TABLE IF NOT EXISTS patients (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            age INT NOT NULL,
            gender ENUM('L', 'P') NOT NULL,
            height_cm INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
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

    db.query(createPatients, (err) => {
        if (err) console.error("Error table patients:", err);
        db.query(createTestLogs, (err) => {
            if (err) console.error("Error table test_logs:", err);
            else console.log("✅ Tabel database siap digunakan!");
        });
    });
}

createTablesAutomatically();

// Endpoint Menerima Data dari ESP8266 (HTTP POST)
app.post('/api/data', (req, res) => {
    const { device_id, pressure, status, patient_id } = req.body;
    
    // Default patient_id = 1 (Dafanda) jika tidak dikirim oleh alat
    const targetPatientId = patient_id ? parseInt(patient_id) : 1;

    const query = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (?, ?, ?, ?)';
    
    db.query(query, [targetPatientId, device_id || 'SPIRO-01', pressure || 0, status || 'Zona Merah'], (err, result) => {
        if (err) {
            console.error("Database Insert Error:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Data sukses disimpan!' });
    });
});

// =========================================================
// ENDPOINT BARU: RESET / MENGOSONGKAN RIWAYAT TES (DELETE)
// =========================================================
app.delete('/api/reset', (req, res) => {
    // Parameter opsional patient_id via query URL (misal: /api/reset?patient_id=1)
    const { patient_id } = req.query;

    let query = 'TRUNCATE TABLE test_logs';
    let queryParams = [];

    // Jika parameter patient_id dikirim, hanya hapus riwayat pasien tersebut
    if (patient_id) {
        query = 'DELETE FROM test_logs WHERE patient_id = ?';
        queryParams = [patient_id];
    }

    db.query(query, queryParams, (err, result) => {
        if (err) {
            console.error("Error Reset Database:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: 'Riwayat data berhasil dikosongkan!' });
    });
});

// Endpoint Mengambil Riwayat Tes untuk Web Dashboard (HTTP GET)
app.get('/api/history', (req, res) => {
    const { patient_id } = req.query;
    let query = 'SELECT * FROM test_logs ORDER BY created_at DESC LIMIT 10';
    let queryParams = [];

    // Filter berdasarkan pasien jika dipanggil dengan /api/history?patient_id=X
    if (patient_id) {
        query = 'SELECT * FROM test_logs WHERE patient_id = ? ORDER BY created_at DESC LIMIT 10';
        queryParams = [patient_id];
    }

    db.query(query, queryParams, (err, results) => {
        if (err) {
            console.error("Database Fetch Error:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json(results);
    });
});

// Fallback Route
app.get('/*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});
