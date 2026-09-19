const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Mengarahkan folder public agar file index.html terbaca
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi Database (Mendukung Local XAMPP & Cloud Aiven)
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'smart_spirometry',
    port: process.env.DB_PORT || 3306,
    ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

db.connect((err) => {
    if (err) {
        console.error('❌ Gagal konek ke database:', err.message);
    } else {
        console.log('✅ Konek ke MySQL berhasil!');
        createTablesAutomatically(); // Otomatis buat tabel jika belum ada di Aiven
    }
});

// Fungsi Pembuat Tabel Otomatis di Database
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

// Endpoint Menerima Data dari ESP8266
app.post('/api/data', (req, res) => {
    const { device_id, pressure, status } = req.body;
    const query = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (1, ?, ?, ?)';
    
    db.query(query, [device_id || 'SPIRO-01', pressure, status], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Memancarkan event via Socket.io
        io.emit('newData', { pressure, status, created_at: new Date() });
        res.json({ message: 'Data sukses disimpan!' });
    });
});

// Endpoint Mengambil Riwayat Tes untuk Web Dashboard
app.get('/api/history', (req, res) => {
    const query = 'SELECT * FROM test_logs ORDER BY created_at DESC LIMIT 10';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Fallback Route (Kompatibel dengan Express v5 & Vercel)
app.get('/*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Jalankan Server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});
