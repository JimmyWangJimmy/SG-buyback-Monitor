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
const SCRAPE_META_FILE = path.join(DATA_DIR, 'scrape-meta.json');
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
/** @type {{ lastScrapeError: null | { message: string, at: string }, lastScrapeOkAt: string | null }} */
let scrapeMeta = { lastScrapeError: null, lastScrapeOkAt: null };

function loadScrapeMeta() {
  if (!fs.existsSync(SCRAPE_META_FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(SCRAPE_META_FILE, 'utf-8'));
    scrapeMeta = {
      lastScrapeError: parsed.lastScrapeError || null,
      lastScrapeOkAt: parsed.lastScrapeOkAt || null,
    };
  } catch (e) {
    logger.warn(`Failed to load scrape-meta: ${e.message}`);
  }
}

function saveScrapeMeta() {
  fs.writeFileSync(SCRAPE_META_FILE, JSON.stringify(scrapeMeta, null, 2));
}

// Load cached data from disk
if (fs.existsSync(DATA_FILE)) {
  try {
    cachedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    logger.info(`Loaded ${cachedData.count} cached records from disk`);
  } catch (e) {
    logger.warn(`Failed to load cache: ${e.message}`);
  }
}
loadScrapeMeta();

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
    lastScrapeError: scrapeMeta.lastScrapeError,
    lastScrapeOkAt: scrapeMeta.lastScrapeOkAt,
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

// POST /api/scrape-status — scraper reports success or final failure (after retries)
app.post('/api/scrape-status', (req, res) => {
  const token = req.headers['x-api-token'] || req.query.token;
  if (token !== API_TOKEN) {
    logger.warn(`scrape-status rejected: invalid token from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid API token' });
  }

  const { ok, error: errMsg } = req.body || {};
  const at = new Date().toISOString();

  if (ok === true) {
    scrapeMeta.lastScrapeError = null;
    scrapeMeta.lastScrapeOkAt = at;
    saveScrapeMeta();
    logger.info(`Scrape status: OK (reported from ${req.ip})`);
    return res.json({ message: 'OK' });
  }

  if (ok === false && errMsg && typeof errMsg === 'string') {
    scrapeMeta.lastScrapeError = { message: errMsg.slice(0, 2000), at };
    saveScrapeMeta();
    logger.error(`Scrape failed (all retries exhausted): ${errMsg}`);
    return res.json({ message: 'Recorded' });
  }

  return res.status(400).json({ error: 'Expected body: { ok: true } or { ok: false, error: string }' });
});

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`SG Buyback Monitor API running at http://localhost:${PORT}`);
  logger.info(`Cached records: ${cachedData.count}`);
});
