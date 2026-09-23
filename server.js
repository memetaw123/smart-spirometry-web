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
app.use(express.static(path.join(__dirname, 'public')));

// Koneksi Database Aiven Cloud menggunakan Pool
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

// Pembuatan Tabel Otomatis
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

// Endpoint Menerima Data dari ESP8266 (Data Sementara Sesi Saat Ini)
app.post('/api/data', (req, res) => {
    const { device_id, pressure, status } = req.body;
    const query = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (1, ?, ?, ?)';
    
    db.query(query, [device_id || 'SPIRO-01', pressure || 0, status || 'Zona Merah'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        io.emit('newData', { pressure, status, created_at: new Date() });
        res.json({ message: 'Data sesi tersimpan!' });
    });
});

// Endpoint Mengambil Riwayat Sesi Saat Ini
app.get('/api/history', (req, res) => {
    const query = 'SELECT * FROM test_logs WHERE patient_id = 1 ORDER BY created_at DESC LIMIT 15';
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ENDPOINT BARU: Akhiri Sesi & Kemas Data Permanen
app.post('/api/save-session', (req, res) => {
    const { usia, tb, bb, gender } = req.body;
    
    // 1. Cari tiupan tertinggi (Peak Flow) di sesi ini
    db.query('SELECT pressure, zone_status FROM test_logs WHERE patient_id = 1 ORDER BY pressure DESC LIMIT 1', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let bestPressure = 0;
        let finalZone = "Belum Ada";
        
        if (results.length > 0) {
            bestPressure = results[0].pressure;
            finalZone = results[0].zone_status;
        }

        // 2. Simpan profil pasien baru
        const queryPatient = 'INSERT INTO patients (name, age, gender, height_cm) VALUES (?, ?, ?, ?)';
        const genderEnum = gender === 'Wanita' ? 'P' : 'L';
        const namaPasien = 'Pasien Sesi ' + new Date().toLocaleTimeString('id-ID'); 
        
        db.query(queryPatient, [namaPasien, usia || 0, genderEnum, tb || 0], (err, patientRes) => {
            if (err) return res.status(500).json({ error: err.message });
            const newPatientId = patientRes.insertId;

            // 3. Simpan rekam medis permanen
            const queryLog = 'INSERT INTO test_logs (patient_id, device_id, pressure, zone_status) VALUES (?, ?, ?, ?)';
            db.query(queryLog, [newPatientId, 'SPIRO-SAVED', bestPressure, finalZone], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                
                // 4. Kosongkan data sementara untuk pasien berikutnya
                db.query('DELETE FROM test_logs WHERE patient_id = 1', (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ message: 'Sesi berhasil dikemas dan disimpan permanen!' });
                });
            });
        });
    });
});

// Endpoint Reset Data Manual Sesi Ini
app.delete('/api/reset', (req, res) => {
    db.query('DELETE FROM test_logs WHERE patient_id = 1', (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Riwayat sementara dikosongkan!' });
    });
});

app.get('/*path', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Server berjalan di port ${PORT}`);
});
