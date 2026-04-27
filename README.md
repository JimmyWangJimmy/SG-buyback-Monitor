# SG Buyback Monitor

SGX 上市公司回购数据监控，默认每 3 小时从 sginvestors.io 抓取最近 7 天的回购记录（可配置）。

## Quick Start (One-Click)

### Windows
Double-click **`start.bat`** — auto install, start server, scrape data, open browser.

### Mac / Linux
```bash
chmod +x start.sh && ./start.sh
```

### Docker
```bash
docker compose up -d
```

### Render Cloud
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/JimmyWangJimmy/SG-buyback-Monitor)

> 点击按钮 → 用 GitHub 登录 Render → 等待构建完成（约 3-5 分钟）→ 自动获得一个公网 URL

### AI Prompt (Claude Code / Cursor)

See [PROMPT.md](PROMPT.md) — copy the prompt, paste into your AI coding tool, done.

## Manual Setup

```bash
npm install          # Install dependencies
npm start            # Start API server → http://localhost:3000
npm run scrape       # One-shot scrape
npm run scrape:schedule  # Auto scrape on CRON_SCHEDULE (default every 3 hours)
```

## 云端定时爬虫（推荐：GitHub Actions，免费）

Web 服务继续部署在 **Render**（`render.yaml` / Deploy 按钮）。爬虫用 **GitHub Actions** 每 3 小时跑一次，避免 Render Cron 的最低月费；失败会自动重试 3 次，仍失败则写入服务端日志并在网页顶部显示错误信息。

1. 把本仓库推送到 GitHub。  
2. 打开仓库 **Settings → Secrets and variables → Actions**，新建 **Repository secrets**：  
   - `API_URL`：你的站点根地址，例如 `https://sg-buyback-monitor.onrender.com`（不要末尾 `/`）  
   - `API_TOKEN`：与 Render 上 Web 服务的 `API_TOKEN` 一致（默认 `sgbuyback2026` 的话请改成自己的强密码，并在 Render 环境变量里同步修改）  
3. 保存后，在 **Actions** 里打开 **Scheduled scrape**，可点 **Run workflow** 手动试跑。  
4. 定时规则见 `.github/workflows/scrape.yml`（UTC `5 */3 * * *`，即每 3 小时一次）。

可选：用 `Dockerfile.scraper` 自建容器定时任务（Fly.io、Railway、Render Cron 等），启动前设置 `API_URL`、`API_TOKEN`，容器内需 `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`（镜像里已配置）。

## API

详见 [API.md](API.md)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/buybacks` | GET | 获取缓存的回购数据 |
| `/api/buybacks?date=2026-04-13` | GET | 按日期筛选 |
| `/api/status` | GET | 服务运行状态 |
| `/api/buybacks/upload` | POST | 上传抓取数据（需鉴权） |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `API_TOKEN` | `sgbuyback2026` | Upload auth token |
| `API_URL` | Render cloud URL | Scraper upload target |
| `CRON_SCHEDULE` | `0 */3 * * *` | Cron schedule for `scrape:schedule` (UTC) |
