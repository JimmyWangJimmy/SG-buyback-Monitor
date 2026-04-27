# SG Buyback Monitor API Documentation

Base URL: `https://sg-buyback-monitor.onrender.com`

---

## Public Endpoints (无需鉴权)

### 1. GET /api/buybacks

获取最近 7 天的 SGX 上市公司回购数据。

#### Query Parameters

| 参数   | 类型   | 必填 | 说明                        |
| ------ | ------ | ---- | --------------------------- |
| `date` | string | 否   | 按日期筛选，格式 `YYYY-MM-DD` |

#### Request Examples

```bash
# 获取全部数据
curl https://sg-buyback-monitor.onrender.com/api/buybacks

# 按日期筛选
curl https://sg-buyback-monitor.onrender.com/api/buybacks?date=2026-04-13
```

```python
import requests

# 全部数据
resp = requests.get("https://sg-buyback-monitor.onrender.com/api/buybacks")
data = resp.json()

# 按日期筛选
resp = requests.get("https://sg-buyback-monitor.onrender.com/api/buybacks", params={"date": "2026-04-13"})
data = resp.json()
```

```javascript
// Node.js / Browser
const resp = await fetch("https://sg-buyback-monitor.onrender.com/api/buybacks");
const data = await resp.json();

// 按日期筛选
const resp2 = await fetch("https://sg-buyback-monitor.onrender.com/api/buybacks?date=2026-04-13");
const data2 = await resp2.json();
```

#### Response `200 OK`

```json
{
  "date": "2026-04-14T07:08:49.451Z",
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

#### Response Fields

| 字段                        | 类型   | 说明                              |
| --------------------------- | ------ | --------------------------------- |
| `date`                      | string | 数据抓取时间 (ISO 8601)           |
| `count`                     | number | 返回的记录数                      |
| `data`                      | array  | 回购记录数组                      |
| `data[].stockName`          | string | 公司名称                          |
| `data[].sgxCode`            | string | SGX 股票代码                      |
| `data[].buybackDate`        | string | 回购日期 (`YYYY-MM-DD`)           |
| `data[].buybackVolume`      | string | 回购量                            |
| `data[].buybackPrice`       | string | 回购价格                          |
| `data[].dayPriceRange`      | string | 当日价格区间                      |
| `data[].dayTotalVolume`     | string | 当日总成交量                      |
| `data[].buybackVsTotalPct`  | string | 回购占总成交量百分比              |

---

### 2. GET /api/status

获取服务运行状态。

#### Request

```bash
curl https://sg-buyback-monitor.onrender.com/api/status
```

#### Response `200 OK`

```json
{
  "cachedRecords": 40,
  "cachedDate": "2026-04-14T07:08:49.451Z",
  "lastUploadTime": "2026-04-14T07:08:50.500Z",
  "uploadCount": 1,
  "lastScrapeError": null,
  "lastScrapeOkAt": "2026-04-14T08:00:00.000Z"
}
```

#### Response Fields

| 字段               | 类型        | 说明 |
| ------------------ | ----------- | ---- |
| `cachedRecords`    | number      | 当前缓存记录数 |
| `cachedDate`       | string/null | 数据抓取时间 |
| `lastUploadTime`   | string/null | 最近一次上传时间 |
| `uploadCount`      | number      | 累计上传次数 |
| `lastScrapeError`  | object/null | 爬虫在重试耗尽后上报的错误；成功后会清空为 `null` |
| `lastScrapeError.message` | string | 错误摘要 |
| `lastScrapeError.at`      | string | ISO 时间 |
| `lastScrapeOkAt`   | string/null | 爬虫最近一次成功上报的时间 |

---

## Internal Endpoints (需鉴权)

### 3. POST /api/buybacks/upload

由本地爬虫调用，上传抓取的数据到云端。需要 API Token 鉴权。

#### Headers

| Header        | 必填 | 说明                    |
| ------------- | ---- | ----------------------- |
| `Content-Type`| 是   | `application/json`      |
| `X-API-Token` | 是   | API 密钥 (默认: `sgbuyback2026`) |

也可通过 query parameter 传递 token: `?token=sgbuyback2026`

#### Request Body

```json
{
  "date": "2026-04-14T07:08:49.451Z",
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

#### Request Example

```bash
curl -X POST https://sg-buyback-monitor.onrender.com/api/buybacks/upload \
  -H "Content-Type: application/json" \
  -H "X-API-Token: sgbuyback2026" \
  -d '{"date":"2026-04-14T00:00:00Z","count":1,"data":[{"stockName":"TEST","sgxCode":"T01","buybackDate":"2026-04-14","buybackVolume":"100","buybackPrice":"1.00","dayPriceRange":"1.00-1.00","dayTotalVolume":"1000","buybackVsTotalPct":"10%"}]}'
```

#### Response `200 OK`

```json
{
  "message": "OK",
  "count": 40
}
```

#### Error Responses

| Status | Body                                    | 说明              |
| ------ | --------------------------------------- | ----------------- |
| `401`  | `{"error": "Invalid API token"}`        | Token 无效        |
| `400`  | `{"error": "Invalid data format"}`      | Body 格式错误     |

---

### 4. POST /api/scrape-status

由爬虫在**一次任务**结束时调用：成功上传（或 0 条跳过上传）时上报成功，或在 **3 次重试仍失败** 后上报失败。服务端会写入日志，并把失败信息持久化到 `data/scrape-meta.json`，供首页展示。

#### Headers

与 `POST /api/buybacks/upload` 相同：`X-API-Token` 或 `?token=`。

#### Request Body

成功：

```json
{ "ok": true }
```

失败（`error` 建议为最后一次尝试的错误信息，长度服务端最多保留约 2000 字符）：

```json
{ "ok": false, "error": "net::ERR_CONNECTION_RESET at ..." }
```

#### Response `200 OK`

```json
{ "message": "OK" }
```

或失败记录：

```json
{ "message": "Recorded" }
```

---

## Error Handling

所有接口在异常时返回：

```json
{
  "error": "error message"
}
```

| HTTP Status | 说明                  |
| ----------- | --------------------- |
| `200`       | 成功                  |
| `400`       | 请求格式错误          |
| `401`       | 鉴权失败              |
| `500`       | 服务端内部错误        |

---

## Architecture

```
┌──────────────┐    POST /api/buybacks/upload     ┌──────────────────┐
│  Local        │ ──────────────────────────────► │  Render Cloud     │
│  Scraper      │    (every 6 hours)              │  API Server       │
│  (scraper.js) │                                 │  (server.js)      │
└──────────────┘                                  └────────┬─────────┘
                                                           │
                                                  GET /api/buybacks
                                                           │
                                                  ┌────────▼─────────┐
                                                  │  External Users   │
                                                  │  (API / Browser)  │
                                                  └──────────────────┘
```

- **数据源**: sginvestors.io (SGX 上市公司回购公告)
- **抓取频率**: 每 6 小时 (本地运行)
- **数据范围**: 最近 7 天的回购记录
- **更新延迟**: 数据每 6 小时更新一次

---

## Quick Start

```bash
# 1. 本地单次抓取并上传
node scraper.js --api https://sg-buyback-monitor.onrender.com

# 2. 本地定时模式 (每6小时自动抓取上传)
node scraper.js --schedule --api https://sg-buyback-monitor.onrender.com

# 3. 查看数据
curl https://sg-buyback-monitor.onrender.com/api/buybacks
```

## Environment Variables

| 变量            | 默认值           | 说明                      | 适用           |
| --------------- | ---------------- | ------------------------- | -------------- |
| `PORT`          | `3000`           | 服务端口                  | server.js      |
| `API_TOKEN`     | `sgbuyback2026`  | 上传接口鉴权密钥          | server.js / scraper.js |
| `API_URL`       | `https://sg-buyback-monitor.onrender.com` | 云端 API 地址 | scraper.js |
| `CRON_SCHEDULE` | `0 */6 * * *`    | 定时抓取 Cron 表达式      | scraper.js     |
