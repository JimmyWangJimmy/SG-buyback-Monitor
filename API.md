# SG Buyback Monitor API Documentation

Base URL: `http://<your-server>:3000`

---

## 1. GET /api/buybacks

获取缓存的回购数据（最近 7 天）。直接返回缓存，不触发抓取。

### Query Parameters

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `date` | string | 否 | 按日期筛选，格式 `YYYY-MM-DD` |

### Request

```bash
# 获取全部数据
curl http://localhost:3000/api/buybacks

# 按日期筛选
curl http://localhost:3000/api/buybacks?date=2026-04-13
```

### Response `200 OK`

```json
{
  "date": "2026-04-14T03:40:18.523Z",
  "count": 40,
  "data": [
    {
      "stockName": "TELECHOICE INTERNATIONAL",
      "sgxCode": "T41",
      "buybackDate": "2026-04-13",
      "buybackVolume": "350,000",
      "buybackPrice": "SGD 0.210",
      "dayPriceRange": "0.210 - 0.215",
      "dayTotalVolume": "522,600",
      "buybackVsTotalPct": "67%"
    }
  ]
}
```

### Response Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| `date` | string | 数据抓取时间 (ISO 8601) |
| `count` | number | 返回的记录数 |
| `data` | array | 回购记录数组 |
| `data[].stockName` | string | 公司名称 |
| `data[].sgxCode` | string | SGX 股票代码 |
| `data[].buybackDate` | string | 回购日期 (YYYY-MM-DD) |
| `data[].buybackVolume` | string | 回购量 |
| `data[].buybackPrice` | string | 回购价格 |
| `data[].dayPriceRange` | string | 当日价格区间 |
| `data[].dayTotalVolume` | string | 当日总成交量 |
| `data[].buybackVsTotalPct` | string | 回购占总成交量百分比 |

---

## 2. GET /api/status

获取爬虫运行状态。

### Request

```bash
curl http://localhost:3000/api/status
```

### Response `200 OK`

```json
{
  "lastScrapeTime": "2026-04-14T03:39:35.991Z",
  "lastSuccess": "2026-04-14T03:40:19.737Z",
  "lastError": null,
  "successCount": 1,
  "failCount": 0,
  "isRunning": false,
  "nextScheduled": "2026-04-14T06:00:00.000Z",
  "cachedRecords": 40,
  "cachedDate": "2026-04-14T03:40:18.523Z",
  "cronSchedule": "0 */6 * * *"
}
```

### Response Fields

| 字段 | 类型 | 说明 |
|------|------|------|
| `lastScrapeTime` | string\|null | 最近一次抓取开始时间 |
| `lastSuccess` | string\|null | 最近一次成功时间 |
| `lastError` | string\|null | 最近一次错误信息（成功后清空） |
| `successCount` | number | 累计成功次数 |
| `failCount` | number | 累计失败次数（3次重试全失败算1次） |
| `isRunning` | boolean | 是否正在抓取中 |
| `nextScheduled` | string | 下次定时抓取时间 |
| `cachedRecords` | number | 当前缓存记录数 |
| `cachedDate` | string\|null | 缓存数据的抓取时间 |
| `cronSchedule` | string | Cron 表达式 |

---

## 3. POST /api/buybacks/refresh

手动触发一次抓取。异步执行，立即返回。

### Request

```bash
curl -X POST http://localhost:3000/api/buybacks/refresh
```

### Response `200 OK`

```json
{
  "message": "Scrape triggered",
  "status": "running"
}
```

### Response `409 Conflict`（已有抓取正在进行）

```json
{
  "error": "Scrape already in progress"
}
```

---

## Error Handling

所有接口在服务端异常时返回：

```json
{
  "error": "error message"
}
```

| HTTP Status | 说明 |
|-------------|------|
| `200` | 成功 |
| `409` | 抓取正在进行，请稍后再试 |
| `500` | 服务端内部错误 |

---

## Environment Variables

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3000` | 服务端口 |
| `CRON_SCHEDULE` | `0 */6 * * *` | 抓取调度 Cron 表达式 |
| `PUPPETEER_EXECUTABLE_PATH` | (auto) | Chromium 路径（Docker 中需设置） |
