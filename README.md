# IP Monitor

Real-time network traffic monitoring tool with a dark-themed Electron dashboard. Captures live packets, tracks per-IP bandwidth, enriches IPs with geolocation data, and visualizes everything through interactive charts and a world map.

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python)
![Electron](https://img.shields.io/badge/Electron-28+-47848F?logo=electron)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **Live Packet Capture** — Sniffs network traffic in real time using Scapy
- **Per-IP Bandwidth Tracking** — Bytes sent/received, packet counts, protocol breakdown per IP
- **GeoIP Enrichment** — Automatic country, city, ISP, and coordinates lookup via ip-api.com
- **Real-Time Dashboard** — Electron desktop app with WebSocket-driven live updates
- **Interactive Charts** — Bandwidth timeline, protocol doughnut, top talkers bar chart
- **World Map** — Leaflet map plotting IP locations with traffic-proportional markers
- **Sortable IP Table** — Full connection list sortable by any column
- **Zero External Database** — All metrics held in memory, no setup required

## Architecture

```
┌──────────────────┐
│  Packet Capture  │  ← Scapy (daemon thread)
│  capture.py      │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  Metrics Store   │  ← Thread-safe in-memory aggregation
│  metrics.py      │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  GeoIP Enrichment│  ← ip-api.com batch lookups + cache
│  geo.py          │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  FastAPI Backend  │  ← REST API + WebSocket (port 8420)
│  app.py          │
└────────┬─────────┘
         │
         v
┌──────────────────┐
│  Electron App    │  ← Chart.js + Leaflet + vanilla JS
│  frontend/       │
└──────────────────┘
```

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Python**  | 3.10+   | [python.org](https://www.python.org/downloads/) |
| **Node.js** | 18+     | [nodejs.org](https://nodejs.org/) |
| **Npcap**   | Latest  | [npcap.com](https://npcap.com/) — required for packet capture on Windows. Install with "WinPcap API-compatible mode" checked. |
| **pip**     | Latest  | Comes with Python |

> **Note:** Packet capture requires **Administrator/root privileges**. Run the app as Administrator on Windows or with `sudo` on Linux/macOS.

## Quick Start

### Windows

```bash
# Clone the repo
git clone https://github.com/Legend0300/ip-monitor.git
cd ip-monitor

# Run the launcher (installs deps + starts app)
# Right-click → Run as Administrator
start.bat
```

### Manual Setup

```bash
# 1. Install Python dependencies
cd backend
pip install -r requirements.txt

# 2. Install Electron dependencies
cd ../frontend
npm install

# 3. Launch (as Administrator/root)
npm start
```

### Development Mode

```bash
# Opens DevTools alongside the dashboard
cd frontend
npm run dev
```

## Project Structure

```
ip-monitor/
├── backend/
│   ├── app.py             # FastAPI server + WebSocket + startup
│   ├── capture.py          # Scapy packet sniffer (daemon thread)
│   ├── metrics.py          # Thread-safe in-memory metrics store
│   ├── geo.py              # GeoIP enrichment (ip-api.com + cache)
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── package.json        # Electron manifest
│   ├── main.js             # Electron main process (spawns backend)
│   ├── preload.js          # Context bridge (minimal)
│   ├── index.html          # Dashboard layout
│   ├── renderer.js         # Charts, map, WebSocket, table logic
│   └── styles.css          # Dark monitoring theme
├── start.bat               # Windows one-click launcher
├── start-dev.bat            # Dev mode launcher
└── .gitignore
```

## API Reference

The backend exposes a REST API on `http://localhost:8420`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/summary` | GET | Total bytes in/out, active IPs, uptime, packet count |
| `/api/ips` | GET | All tracked IPs with full metrics and geo data |
| `/api/ips/{ip}` | GET | Metrics and geo for a specific IP |
| `/api/top?limit=N` | GET | Top N IPs by total traffic (default: 10) |
| `/api/protocols` | GET | Traffic breakdown by protocol (TCP/UDP/ICMP/Other) |
| `/api/timeline` | GET | Rolling 5-minute bandwidth timeline (1s intervals) |
| `/ws` | WebSocket | Pushes live updates every 2 seconds |

### WebSocket Message Format

```json
{
  "type": "update",
  "summary": { "total_bytes_in": 0, "total_bytes_out": 0, "active_ips": 0, "uptime": 0, "total_packets": 0 },
  "top_ips": [{ "ip": "8.8.8.8", "total_bytes": 1024, "bytes_sent": 512, "bytes_received": 512 }],
  "protocols": { "TCP": 5000, "UDP": 300, "ICMP": 50 },
  "timeline_point": { "timestamp": 1709900000.0, "bytes_in": 1024, "bytes_out": 512 }
}
```

## Dashboard Panels

| Panel | Type | Description |
|-------|------|-------------|
| Summary Cards | Stats | Total In/Out, Active IPs, Packets, Uptime |
| Bandwidth Timeline | Line Chart | Rolling bytes in/out over the last 5 minutes |
| Protocol Breakdown | Doughnut Chart | TCP vs UDP vs ICMP vs Other |
| Top Talkers | Horizontal Bar | Top 10 IPs by traffic (sent + received stacked) |
| World Map | Leaflet Map | IP locations with traffic-proportional circle markers |
| IP Table | Data Table | All connections, sortable by any column |

## Configuration

The app uses sensible defaults with no config files needed:

| Setting | Default | Where |
|---------|---------|-------|
| Backend port | 8420 | `backend/app.py` |
| WebSocket push interval | 2 seconds | `backend/app.py` |
| Timeline window | 300 points (5 min) | `backend/metrics.py` |
| Geo enrichment interval | 5 seconds | `backend/geo.py` |
| Table refresh | 5 seconds | `frontend/renderer.js` |
| Map refresh | 10 seconds | `frontend/renderer.js` |
| Window size | 1400×900 | `frontend/main.js` |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Permission denied for packet capture" | Run as Administrator (Windows) or `sudo` (Linux/macOS) |
| "Scapy/Npcap not available" | Install [Npcap](https://npcap.com) with WinPcap compatibility mode |
| Dashboard shows "Connecting..." | Ensure the backend started successfully. Check terminal for errors. |
| No geo data appearing | ip-api.com has a rate limit of 45 req/min. Private IPs show as "Local Network". |
| Electron window is blank | Check DevTools console (run with `npm run dev`). Verify CDN access for Chart.js/Leaflet. |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Packet Sniffing | Python + Scapy |
| GeoIP Enrichment | ip-api.com (free, no key required) |
| REST API | FastAPI + Uvicorn |
| Real-Time Push | WebSocket |
| Desktop Shell | Electron |
| Charts | Chart.js |
| Map | Leaflet + CartoDB Dark Tiles |
| Styling | Vanilla CSS (dark theme) |

## License

MIT
