# SG Buyback Monitor

SGX 上市公司回购数据监控，自动每 6 小时从 sginvestors.io 抓取最近 7 天的回购记录。

## One-Click Deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/JimmyWangJimmy/SG-buyback-Monitor)

> 点击按钮 → 用 GitHub 登录 Render → 等待构建完成（约 3-5 分钟）→ 自动获得一个公网 URL

## API

详见 [API.md](API.md)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/buybacks` | GET | 获取缓存的回购数据 |
| `/api/buybacks?date=2026-04-13` | GET | 按日期筛选 |
| `/api/status` | GET | 爬虫运行状态 |
| `/api/buybacks/refresh` | POST | 手动触发抓取 |

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## Docker

```bash
docker compose up -d
```
