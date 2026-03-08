# Setup Guide

Detailed setup instructions for IP Monitor.

## System Requirements

### Windows
- Windows 10/11
- Python 3.10 or newer
- Node.js 18 or newer
- [Npcap](https://npcap.com/) driver (for packet capture)

### Linux
- Python 3.10+
- Node.js 18+
- `libpcap-dev` package (`sudo apt install libpcap-dev` on Debian/Ubuntu)
- Root privileges for packet capture

### macOS
- Python 3.10+
- Node.js 18+
- libpcap (pre-installed on macOS)
- Root privileges for packet capture

---

## Step-by-Step Installation

### 1. Install Npcap (Windows Only)

1. Download from [npcap.com](https://npcap.com/)
2. Run the installer
3. **Check** "Install Npcap in WinPcap API-compatible mode"
4. Complete the installation
5. Restart your terminal

### 2. Clone the Repository

```bash
git clone https://github.com/Legend0300/ip-monitor.git
cd ip-monitor
```

### 3. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

Dependencies installed:
| Package | Purpose |
|---------|---------|
| `fastapi` | REST API framework |
| `uvicorn` | ASGI server |
| `scapy` | Packet capture and parsing |
| `httpx` | Async HTTP client for GeoIP lookups |
| `websockets` | WebSocket support for uvicorn |

### 4. Install Frontend Dependencies

```bash
cd ../frontend
npm install
```

This installs Electron (~200MB on first install).

### 5. Run the Application

```bash
# From the frontend directory, as Administrator:
npm start
```

Or use the provided launcher:
```bash
# From the project root, right-click → Run as Administrator:
start.bat
```

---

## Running Without Packet Capture

If you don't have Npcap installed or don't have admin privileges, the app will still start. You'll see a warning in the console:

```
Packet capture not started — Scapy/Npcap is not available.
```

The dashboard will load but show no traffic data. The API will respond with empty metrics. This is useful for testing the frontend or developing without admin access.

---

## Running Backend Independently

You can run the FastAPI backend separately for development:

```bash
cd backend
python app.py
```

The API will be available at `http://localhost:8420`. You can access the auto-generated docs at `http://localhost:8420/docs`.

---

## Running Frontend Independently

If the backend is already running, you can start just the Electron app:

```bash
cd frontend
npm start
```

For development with DevTools:
```bash
npm run dev
```

---

## Verifying the Installation

1. **Backend health check:**
   ```bash
   curl http://localhost:8420/api/summary
   ```
   Expected response:
   ```json
   {"total_bytes_in":0,"total_bytes_out":0,"active_ips":0,"uptime":1.23,"total_packets":0}
   ```

2. **Dashboard loads:** The Electron window should show the dark monitoring dashboard with "Connected" status.

3. **Packet capture works:** If running as admin with Npcap, the Active IPs counter should start incrementing within a few seconds.
