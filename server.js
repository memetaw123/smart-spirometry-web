const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Membuka akses folder public untuk web dashboard

// Koneksi ke Database phpMyAdmin
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'smart_spirometry'
});

db.connect((err) => {
    if (err) {
        console.error('❌ Gagal konek ke database:', err.message);
    } else {
        console.log('✅ Konek ke MySQL: smart_spirometry berhasil!');
    }
});

// Endpoint untuk menerima data dari alat (ESP8266)
app.post('/api/data', (req, res) => {
    const { device_id, pressure, status } = req.body;
    
    const query = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (1, ?, ?, ?)';
    
    db.query(query, [device_id || 'SPIRO-01', pressure, status], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Memancarkan data real-time ke web dashboard
        io.emit('newData', { pressure, status, created_at: new Date() });
        res.json({ message: 'Data sukses disimpan!' });
    });
});

// Endpoint untuk mengambil riwayat tes
app.get('/api/history', (req, res) => {
    const query = 'SELECT * FROM test_logs ORDER BY created_at DESC LIMIT 10';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

server.listen(3000, () => {
    console.log('🚀 Server berjalan di http://localhost:3000');
});