# API Documentation

The IP Monitor backend runs a FastAPI server on port **8420**.

Auto-generated interactive docs are available at `http://localhost:8420/docs` when the backend is running.

---

## REST Endpoints

### GET /api/summary

Returns overall network monitoring statistics.

**Response:**
```json
{
  "total_bytes_in": 1048576,
  "total_bytes_out": 524288,
  "active_ips": 42,
  "uptime": 3661.5,
  "total_packets": 15230
}
```

| Field | Type | Description |
|-------|------|-------------|
| `total_bytes_in` | int | Total bytes received across all IPs |
| `total_bytes_out` | int | Total bytes sent across all IPs |
| `active_ips` | int | Number of unique IPs seen |
| `uptime` | float | Seconds since the backend started |
| `total_packets` | int | Total deduplicated packet count |

---

### GET /api/ips

Returns all tracked IPs with full metrics and geolocation.

**Response:**
```json
[
  {
    "ip": "8.8.8.8",
    "bytes_sent": 2048,
    "bytes_received": 8192,
    "packets_sent": 10,
    "packets_received": 40,
    "first_seen": 1709900000.0,
    "last_seen": 1709900060.0,
    "protocols": { "UDP": 10240 },
    "geo": {
      "status": "success",
      "country": "United States",
      "countryCode": "US",
      "region": "VA",
      "regionName": "Virginia",
      "city": "Ashburn",
      "lat": 39.03,
      "lon": -77.5,
      "isp": "Google LLC",
      "org": "Google Public DNS",
      "as": "AS15169 Google LLC",
      "query": "8.8.8.8"
    }
  }
]
```

---

### GET /api/ips/{ip}

Returns metrics for a specific IP address.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ip` | path | IP address to look up |

**Response:** Same shape as a single entry from `/api/ips`.

**Error (404):**
```json
{ "detail": "IP not found" }
```

---

### GET /api/top

Returns the top IPs ranked by total traffic.

**Query Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| `limit` | int | 10 | Number of IPs to return (1-100) |

**Response:**
```json
[
  {
    "ip": "142.250.80.46",
    "total_bytes": 524288,
    "bytes_sent": 131072,
    "bytes_received": 393216,
    "packets_sent": 500,
    "packets_received": 1500,
    "protocols": { "TCP": 524288 },
    "geo": { ... }
  }
]
```

---

### GET /api/protocols

Returns total bytes per protocol.

**Response:**
```json
{
  "TCP": 1048576,
  "UDP": 65536,
  "ICMP": 1024,
  "Other": 256
}
```

---

### GET /api/timeline

Returns the rolling bandwidth timeline (last 5 minutes, 1-second intervals, max 300 points).

**Response:**
```json
[
  { "timestamp": 1709900000.0, "bytes_in": 4096, "bytes_out": 2048 },
  { "timestamp": 1709900001.0, "bytes_in": 3072, "bytes_out": 1536 }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | float | Unix timestamp (seconds) |
| `bytes_in` | int | Bytes received during this 1-second interval |
| `bytes_out` | int | Bytes sent during this 1-second interval |

---

## WebSocket

### WS /ws

Pushes live monitoring updates every 2 seconds.

**Connect:**
```javascript
const ws = new WebSocket('ws://localhost:8420/ws');
```

**Message format:**
```json
{
  "type": "update",
  "summary": {
    "total_bytes_in": 1048576,
    "total_bytes_out": 524288,
    "active_ips": 42,
    "uptime": 3661.5,
    "total_packets": 15230
  },
  "top_ips": [ ... ],
  "protocols": { "TCP": 1048576, "UDP": 65536 },
  "timeline_point": {
    "timestamp": 1709900060.0,
    "bytes_in": 4096,
    "bytes_out": 2048
  }
}
```

The WebSocket connection supports multiple simultaneous clients. Each client receives independent pushes every 2 seconds.

---

## GeoIP Data

Geolocation is fetched from [ip-api.com](http://ip-api.com/) (free tier, no API key needed).

- **Rate limit:** 45 requests/minute (single), 15 requests/minute (batch)
- **Caching:** Each IP is looked up once and cached in memory
- **Private IPs:** Automatically tagged as "Private" / "Local Network" without an API call
- **Batch size:** Up to 100 IPs per request

Private IP geo object:
```json
{
  "status": "private",
  "country": "Private",
  "city": "Local Network",
  "lat": 0,
  "lon": 0,
  "isp": "Private Range"
}
```
