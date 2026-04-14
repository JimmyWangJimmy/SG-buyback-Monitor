const express = require('express');
const winston = require('winston');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ─── Config ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN || 'sgbuyback2026';
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'buybacks.json');
const LOG_DIR = path.join(__dirname, 'logs');

[DATA_DIR, LOG_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Logger ──────────────────────────────────────────────────────────
require('winston-daily-rotate-file');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(
      ({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'server-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

// ─── State ───────────────────────────────────────────────────────────
let cachedData = { date: null, count: 0, data: [] };
let uploadStats = {
  lastUploadTime: null,
  uploadCount: 0,
};

// Load cached data from disk
if (fs.existsSync(DATA_FILE)) {
  try {
    cachedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    logger.info(`Loaded ${cachedData.count} cached records from disk`);
  } catch (e) {
    logger.warn(`Failed to load cache: ${e.message}`);
  }
}

// ─── Express ─────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/buybacks - return cached data
app.get('/api/buybacks', (req, res) => {
  let result = cachedData;

  if (req.query.date) {
    const filtered = result.data.filter((r) => r.buybackDate === req.query.date);
    result = { ...result, count: filtered.length, data: filtered };
  }

  res.json(result);
});

// GET /api/status
app.get('/api/status', (req, res) => {
  res.json({
    cachedRecords: cachedData.count,
    cachedDate: cachedData.date,
    lastUploadTime: uploadStats.lastUploadTime,
    uploadCount: uploadStats.uploadCount,
  });
});

// POST /api/buybacks/upload - receive data from local scraper
app.post('/api/buybacks/upload', (req, res) => {
  const token = req.headers['x-api-token'] || req.query.token;
  if (token !== API_TOKEN) {
    logger.warn(`Upload rejected: invalid token from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API token' });
  }

  const { date, count, data } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }

  cachedData = { date: date || new Date().toISOString(), count: data.length, data };
  fs.writeFileSync(DATA_FILE, JSON.stringify(cachedData, null, 2));

  uploadStats.lastUploadTime = new Date().toISOString();
  uploadStats.uploadCount++;

  logger.info(`Data uploaded: ${data.length} records from ${req.ip}`);
  res.json({ message: 'OK', count: data.length });
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`SG Buyback Monitor API running at http://localhost:${PORT}`);
  logger.info(`Cached records: ${cachedData.count}`);
});
