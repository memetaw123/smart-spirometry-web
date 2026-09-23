const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Menyajikan file statis dari folder public
app.use(express.static(path.join(__dirname, 'public')));

// Konfigurasi Koneksi Database Aiven MySQL
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'your-aiven-host.aivencloud.com',
    user: process.env.DB_USER || 'avnadmin',
    password: process.env.DB_PASSWORD || 'your-password',
    database: process.env.DB_NAME || 'defaultdb',
    port: process.env.DB_PORT || 11614,
    ssl: { rejectUnauthorized: false }
});

// Endpoint untuk menerima data dari ESP8266 (alat spirometri)
app.post('/api/data', (req, res) => {
    const { device_id, pressure, zone_status } = req.body;
    
    if (!pressure || !zone_status) {
        return res.status(400).json({ error: 'Data tekanan dan status zona wajib diisi!' });
    }

    const query = 'INSERT INTO spirometry_logs (device_id, pressure, zone_status) VALUES (?, ?, ?)';
    pool.query(query, [device_id || 'ESP8266_01', pressure, zone_status], (err, results) => {
        if (err) {
            console.error('Gagal menyimpan ke database:', err);
            return res.status(500).json({ error: 'Gagal menyimpan ke database' });
        }
        res.status(200).json({ message: 'Data berhasil disimpan ke database', id: results.insertId });
    });
});

// Endpoint untuk mengambil riwayat log pengujian
app.get('/api/history', (req, res) => {
    const query = 'SELECT * FROM spirometry_logs ORDER BY created_at DESC LIMIT 20';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Gagal mengambil data:', err);
            return res.status(500).json({ error: 'Gagal mengambil riwayat data' });
        }
        res.status(200).json(results);
    });
});

// Endpoint baru: Menyimpan sesi pasien secara permanen ke tabel patients/logs
app.post('/api/save-session', (req, res) => {
    const { usia, tb, bb, gender } = req.body;

    // Contoh query penyimpanan ke database Aiven untuk rekam medis pasien
    const query = 'INSERT INTO patients (age, height_cm, weight_kg, gender, created_at) VALUES (?, ?, ?, ?, NOW())';
    pool.query(query, [usia, tb, bb || null, gender], (err, results) => {
        if (err) {
            console.error('Gagal menyimpan sesi pasien:', err);
            return res.status(500).json({ error: 'Gagal menyimpan sesi ke database' });
        }
        res.status(200).json({ message: 'Sesi pasien berhasil disimpan secara permanen' });
    });
});

// Endpoint untuk mereset/mengosongkan riwayat log
app.delete('/api/reset', (req, res) => {
    const query = 'DELETE FROM spirometry_logs';
    pool.query(query, (err, results) => {
        if (err) {
            console.error('Gagal mereset data:', err);
            return res.status(500).json({ error: 'Gagal mereset riwayat' });
        }
        res.status(200).json({ message: 'Riwayat berhasil dikosongkan' });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server backend berjalan di port ${PORT}`);
});
