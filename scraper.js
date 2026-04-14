/**
 * Local scraper — runs on your machine, pushes data to cloud API.
 *
 * Usage:
 *   node scraper.js                          # one-shot scrape + upload
 *   node scraper.js --schedule               # run every 6 hours
 *   node scraper.js --api http://your-url    # custom API endpoint
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cheerio = require('cheerio');
const cron = require('node-cron');
const https = require('https');
const http = require('http');

puppeteer.use(StealthPlugin());

// ─── Config ──────────────────────────────────────────────────────────
const API_URL = getArg('--api') || process.env.API_URL || 'https://sg-buyback-monitor.onrender.com';
const API_TOKEN = getArg('--token') || process.env.API_TOKEN || 'sgbuyback2026';
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 */6 * * *';
const MAX_RETRIES = 3;
const SCHEDULE_MODE = process.argv.includes('--schedule');
const TARGET_URL = 'https://sginvestors.io/news/sgx-listed-companies-share-buy-back';

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  return idx > -1 && process.argv[idx + 1] ? process.argv[idx + 1] : null;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function randomDelay(min = 2000, max = 5000) {
  return new Promise((r) => setTimeout(r, min + Math.floor(Math.random() * (max - min))));
}

// ─── Scraper ─────────────────────────────────────────────────────────
async function scrape() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
    await page.setUserAgent(ua);
    await page.setViewport({ width: 1920, height: 1080 });

    log('First page load (cookie setup)...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 6000));

    log('Second page load (data fetch)...');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise((r) => setTimeout(r, 6000));

    // Wait for table data to appear
    try {
      await page.waitForSelector('#stock-list-sgx-counter tbody tr.stock td a', { timeout: 15000 });
      log('Table data loaded');
    } catch {
      log('Warning: table data not found after wait');
    }

    // Click "load more"
    let clicks = 0;
    while (clicks < 10) {
      const btn = await page.$('tr[id^="io-load-more-"]');
      if (!btn) break;
      try {
        await btn.scrollIntoView();
        await btn.click();
        await randomDelay(2000, 4000);
        clicks++;
        log(`Clicked "load more" (${clicks})`);
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

    log(`Scraped ${rows.length} total, ${filtered.length} in last 7 days`);
    return { date: new Date().toISOString(), count: filtered.length, data: filtered };
  } finally {
    if (browser) await browser.close();
  }
}

// ─── Upload to cloud ─────────────────────────────────────────────────
function upload(data) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + '/api/buybacks/upload');
    const transport = url.protocol === 'https:' ? https : http;
    const body = JSON.stringify(data);

    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'X-API-Token': API_TOKEN,
        },
      },
      (res) => {
        let responseBody = '';
        res.on('data', (d) => (responseBody += d));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(JSON.parse(responseBody));
          } else {
            reject(new Error(`Upload failed: ${res.statusCode} ${responseBody}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Run ─────────────────────────────────────────────────────────────
async function run() {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      log(`Scrape attempt ${attempt}/${MAX_RETRIES}...`);
      const result = await scrape();

      if (result.count === 0) {
        log('Warning: 0 records found, skipping upload');
        return;
      }

      log(`Uploading ${result.count} records to ${API_URL}...`);
      const resp = await upload(result);
      log(`Upload OK: ${resp.count} records`);
      return;
    } catch (err) {
      log(`Attempt ${attempt} failed: ${err.message}`);
      if (attempt < MAX_RETRIES) {
        const wait = Math.pow(3, attempt) * 10;
        log(`Retrying in ${wait}s...`);
        await new Promise((r) => setTimeout(r, wait * 1000));
      }
    }
  }
  log('All attempts failed!');
}

// ─── Entry ───────────────────────────────────────────────────────────
if (SCHEDULE_MODE) {
  log(`Scheduler mode: ${CRON_SCHEDULE}`);
  log(`API target: ${API_URL}`);
  run(); // Run immediately
  cron.schedule(CRON_SCHEDULE, () => {
    log('Scheduled scrape triggered');
    run();
  });
} else {
  log('One-shot mode');
  log(`API target: ${API_URL}`);
  run().then(() => process.exit(0)).catch(() => process.exit(1));
}
