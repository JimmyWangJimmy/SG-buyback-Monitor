const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const cron = require('node-cron');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

puppeteer.use(StealthPlugin());

// ─── Config ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 */6 * * *';
const MAX_RETRIES = 3;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'buybacks.json');
const LOG_DIR = path.join(__dirname, 'logs');
const TARGET_URL =
  'https://sginvestors.io/news/sgx-listed-companies-share-buy-back';

// Ensure directories exist
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
      filename: 'buyback-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
    }),
  ],
});

// ─── State ───────────────────────────────────────────────────────────
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
];

let scrapeStats = {
  lastScrapeTime: null,
  lastSuccess: null,
  lastError: null,
  successCount: 0,
  failCount: 0,
  isRunning: false,
  nextScheduled: null,
};

let cachedData = { date: null, count: 0, data: [] };

// Load cached data from disk on startup
if (fs.existsSync(DATA_FILE)) {
  try {
    cachedData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    logger.info(`Loaded ${cachedData.count} cached records from disk`);
  } catch (e) {
    logger.warn(`Failed to load cache file: ${e.message}`);
  }
}

// ─── Scraper ─────────────────────────────────────────────────────────
function randomDelay(min = 2000, max = 5000) {
  return new Promise((r) =>
    setTimeout(r, min + Math.floor(Math.random() * (max - min)))
  );
}

function pickUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function scrape() {
  let browser;
  try {
    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();
    await page.setUserAgent(pickUA());
    await page.setViewport({ width: 1920, height: 1080 });

    // First load: sets cookies via iframe
    logger.info('First page load (cookie setup)...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);

    // Second load: server returns table data with cookies
    logger.info('Second page load (data fetch)...');
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await randomDelay(3000, 5000);

    // Click "load more" to get all data
    let loadMoreClicks = 0;
    while (loadMoreClicks < 10) {
      const btn = await page.$('tr[id^="io-load-more-"]');
      if (!btn) break;
      try {
        await btn.scrollIntoView();
        await btn.click();
        await randomDelay(2000, 4000);
        loadMoreClicks++;
        logger.info(`Clicked "load more" (${loadMoreClicks})`);
      } catch {
        break;
      }
    }

    const html = await page.content();
    const $ = cheerio.load(html);

    const rows = [];
    $('#stock-list-sgx-counter tbody tr.stock').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 8) return;

      const nameCell = $(tds[1]);
      const stockLink = nameCell.find('a');
      const fullText = nameCell.text().trim();
      const sgxCodeMatch = fullText.match(/\(SGX:([^)]+)\)/);
      const sgxCode = sgxCodeMatch ? sgxCodeMatch[1] : '';
      const stockName = (stockLink.text().trim() || fullText)
        .replace(/\(SGX:[^)]+\)/, '')
        .trim();

      const buybackDate = $(tds[2]).text().trim();
      const buybackVolume = $(tds[3]).text().trim();
      const buybackPrice = $(tds[4]).text().trim();
      const dayPriceRange = $(tds[5]).text().trim();
      const dayTotalVolume = $(tds[6]).text().trim();
      const buybackVsTotalPct = $(tds[7]).text().trim();

      if (!buybackDate || buybackDate.length < 8) return;

      rows.push({
        stockName,
        sgxCode,
        buybackDate,
        buybackVolume,
        buybackPrice,
        dayPriceRange,
        dayTotalVolume,
        buybackVsTotalPct,
      });
    });

    // Filter last 7 days
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const filtered = rows.filter((row) => {
      const d = new Date(row.buybackDate);
      return !isNaN(d.getTime()) && d >= sevenDaysAgo && d <= now;
    });

    logger.info(`Scraped ${rows.length} total rows, ${filtered.length} in last 7 days`);
    return { date: new Date().toISOString(), count: filtered.length, data: filtered };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Retry wrapper ───────────────────────────────────────────────────
async function scrapeWithRetry() {
  if (scrapeStats.isRunning) {
    logger.warn('Scrape already in progress, skipping');
    return;
  }

  scrapeStats.isRunning = true;
  scrapeStats.lastScrapeTime = new Date().toISOString();

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info(`Scrape attempt ${attempt}/${MAX_RETRIES}...`);
      const result = await scrape();

      // Update cache
      cachedData = result;
      fs.writeFileSync(DATA_FILE, JSON.stringify(result, null, 2));

      scrapeStats.lastSuccess = new Date().toISOString();
      scrapeStats.lastError = null;
      scrapeStats.successCount++;
      scrapeStats.isRunning = false;

      logger.info(`Scrape successful: ${result.count} records cached`);
      return result;
    } catch (err) {
      logger.error(`Attempt ${attempt} failed: ${err.message}`);
      scrapeStats.lastError = err.message;

      if (attempt < MAX_RETRIES) {
        const backoff = Math.pow(3, attempt) * 10000; // 30s, 90s, 270s
        logger.info(`Retrying in ${backoff / 1000}s...`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
  }

  scrapeStats.failCount++;
  scrapeStats.isRunning = false;
  logger.error(`All ${MAX_RETRIES} attempts failed`);
}

// ─── Express server ──────────────────────────────────────────────────
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// GET /api/buybacks - return cached data
app.get('/api/buybacks', (req, res) => {
  let result = cachedData;

  // Optional date filter: ?date=2026-04-13
  if (req.query.date) {
    const filtered = result.data.filter((r) => r.buybackDate === req.query.date);
    result = { ...result, count: filtered.length, data: filtered };
  }

  res.json(result);
});

// GET /api/status - scraper status
app.get('/api/status', (req, res) => {
  res.json({
    ...scrapeStats,
    cachedRecords: cachedData.count,
    cachedDate: cachedData.date,
    cronSchedule: CRON_SCHEDULE,
  });
});

// POST /api/buybacks/refresh - manual trigger
app.post('/api/buybacks/refresh', async (req, res) => {
  if (scrapeStats.isRunning) {
    return res.status(409).json({ error: 'Scrape already in progress' });
  }
  scrapeWithRetry();
  res.json({ message: 'Scrape triggered', status: 'running' });
});

// ─── Scheduler ───────────────────────────────────────────────────────
cron.schedule(CRON_SCHEDULE, () => {
  logger.info('Scheduled scrape triggered');
  scrapeWithRetry();
});

// Compute next scheduled time for status endpoint
function updateNextScheduled() {
  const now = new Date();
  const hours = now.getHours();
  const nextHour = Math.ceil((hours + 1) / 6) * 6;
  const next = new Date(now);
  next.setHours(nextHour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  scrapeStats.nextScheduled = next.toISOString();
}
setInterval(updateNextScheduled, 60000);
updateNextScheduled();

// ─── Start ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`SG Buyback Monitor running at http://localhost:${PORT}`);
  logger.info(`Scrape schedule: ${CRON_SCHEDULE}`);

  // Run first scrape on startup if no cached data or data is stale (>6h)
  const staleThreshold = 6 * 60 * 60 * 1000;
  const isStale =
    !cachedData.date || Date.now() - new Date(cachedData.date).getTime() > staleThreshold;

  if (isStale) {
    logger.info('No recent data, running initial scrape...');
    scrapeWithRetry();
  } else {
    logger.info(`Using cached data from ${cachedData.date} (${cachedData.count} records)`);
  }
});
