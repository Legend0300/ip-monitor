// =============================================================================
// IP Monitor — Dashboard Renderer
// =============================================================================

const API_BASE = 'http://localhost:8420';
const WS_URL = 'ws://localhost:8420/ws';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let ws = null;
let wsConnected = false;
let reconnectTimer = null;

let timelineChart = null;
let protocolChart = null;
let topTalkersChart = null;
let portsChart = null;
let portProtocolChart = null;
let leafletMap = null;
let mapMarkers = [];

let ipData = [];
let sortColumn = 'bytes_received';
let sortDirection = 'desc';

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '--';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const idx = Math.min(i, units.length - 1);
  return (bytes / Math.pow(k, idx)).toFixed(idx === 0 ? 0 : 2) + ' ' + units[idx];
}

function formatUptime(seconds) {
  if (seconds == null || isNaN(seconds)) return '--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '--';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function timeLabel(ts) {
  const d = new Date(ts * 1000); // Python time.time() is in seconds
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatTimestamp(ts) {
  if (!ts) return '--';
  return new Date(ts * 1000).toLocaleString();
}

const WELL_KNOWN_PORTS = {
  20:'FTP-Data',21:'FTP',22:'SSH',23:'Telnet',25:'SMTP',53:'DNS',67:'DHCP',68:'DHCP',
  80:'HTTP',110:'POP3',119:'NNTP',123:'NTP',135:'RPC',137:'NetBIOS',138:'NetBIOS',
  139:'NetBIOS',143:'IMAP',161:'SNMP',162:'SNMP',389:'LDAP',443:'HTTPS',445:'SMB',
  465:'SMTPS',514:'Syslog',587:'SMTP',636:'LDAPS',993:'IMAPS',995:'POP3S',
  1080:'SOCKS',1433:'MSSQL',1434:'MSSQL',1723:'PPTP',3306:'MySQL',3389:'RDP',
  5060:'SIP',5061:'SIP-TLS',5432:'PostgreSQL',5900:'VNC',6379:'Redis',
  8080:'HTTP-Alt',8443:'HTTPS-Alt',8888:'HTTP-Alt',9090:'Prometheus',
  27017:'MongoDB',5672:'AMQP',15672:'RabbitMQ',11211:'Memcached',
};

function getPortService(port) {
  return WELL_KNOWN_PORTS[port] || (port < 1024 ? 'System' : 'App');
}

// ---------------------------------------------------------------------------
// DOM References
// ---------------------------------------------------------------------------

const dom = {
  overlay:        document.getElementById('connection-overlay'),
  statusDot:      document.getElementById('status-indicator'),
  statusLabel:    document.getElementById('connection-label'),
  totalIn:        document.getElementById('total-in'),
  totalOut:       document.getElementById('total-out'),
  activeIps:      document.getElementById('active-ips'),
  totalPackets:   document.getElementById('total-packets'),
  uptime:         document.getElementById('uptime'),
  ipCount:        document.getElementById('ip-count'),
  ipTableBody:    document.getElementById('ip-table-body'),
  lastUpdate:     document.getElementById('last-update'),
};

// ---------------------------------------------------------------------------
// Connection Status
// ---------------------------------------------------------------------------

function setConnected(connected) {
  wsConnected = connected;
  dom.statusDot.className = 'status-dot ' + (connected ? 'connected' : 'disconnected');
  dom.statusLabel.textContent = connected ? 'Connected' : 'Disconnected';
}

function hideOverlay() {
  dom.overlay.classList.add('hidden');
}

function showOverlay() {
  dom.overlay.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Chart.js — Common Config
// ---------------------------------------------------------------------------

const chartColors = {
  cyan:   '#00d4ff',
  orange: '#ff6b35',
  green:  '#00ff88',
  red:    '#ff3366',
  grid:   'rgba(255, 255, 255, 0.06)',
  tick:   '#8888aa',
};

Chart.defaults.color = chartColors.tick;
Chart.defaults.borderColor = chartColors.grid;
Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";

// ---------------------------------------------------------------------------
// Bandwidth Timeline Chart
// ---------------------------------------------------------------------------

function initTimelineChart() {
  const ctx = document.getElementById('timeline-chart').getContext('2d');
  timelineChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Bytes In',
          data: [],
          borderColor: chartColors.cyan,
          backgroundColor: 'rgba(0, 212, 255, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 6,
        },
        {
          label: 'Bytes Out',
          data: [],
          borderColor: chartColors.orange,
          backgroundColor: 'rgba(255, 107, 53, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          pointHitRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 16, boxWidth: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBytes(ctx.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxTicksLimit: 10, maxRotation: 0 },
        },
        y: {
          grid: { color: chartColors.grid },
          ticks: {
            callback: (v) => formatBytes(v),
            maxTicksLimit: 6,
          },
        },
      },
    },
  });
}

function updateTimeline(point) {
  if (!timelineChart || !point) return;
  const labels = timelineChart.data.labels;
  const dsIn = timelineChart.data.datasets[0].data;
  const dsOut = timelineChart.data.datasets[1].data;

  labels.push(timeLabel(point.timestamp));
  dsIn.push(point.bytes_in);
  dsOut.push(point.bytes_out);

  // Keep last 300 points
  const MAX = 300;
  if (labels.length > MAX) {
    labels.splice(0, labels.length - MAX);
    dsIn.splice(0, dsIn.length - MAX);
    dsOut.splice(0, dsOut.length - MAX);
  }

  timelineChart.update('none');
}

function loadFullTimeline(data) {
  if (!timelineChart || !data) return;
  timelineChart.data.labels = data.map(p => timeLabel(p.timestamp));
  timelineChart.data.datasets[0].data = data.map(p => p.bytes_in);
  timelineChart.data.datasets[1].data = data.map(p => p.bytes_out);

  // Trim to 300
  const MAX = 300;
  if (timelineChart.data.labels.length > MAX) {
    const offset = timelineChart.data.labels.length - MAX;
    timelineChart.data.labels.splice(0, offset);
    timelineChart.data.datasets[0].data.splice(0, offset);
    timelineChart.data.datasets[1].data.splice(0, offset);
  }

  timelineChart.update('none');
}

// ---------------------------------------------------------------------------
// Protocol Breakdown Chart
// ---------------------------------------------------------------------------

const protocolColorMap = {
  TCP:   '#36a2eb',
  UDP:   '#ff6384',
  ICMP:  '#ffce56',
};
const defaultProtocolColor = '#4bc0c0';

function getProtocolColor(proto) {
  return protocolColorMap[proto] || defaultProtocolColor;
}

function initProtocolChart() {
  const ctx = document.getElementById('protocol-chart').getContext('2d');
  protocolChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderColor: '#12122a',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { usePointStyle: true, padding: 12, boxWidth: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${formatNumber(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function updateProtocols(protocols) {
  if (!protocolChart || !protocols) return;
  const labels = Object.keys(protocols);
  const data = Object.values(protocols);
  const colors = labels.map(getProtocolColor);

  protocolChart.data.labels = labels;
  protocolChart.data.datasets[0].data = data;
  protocolChart.data.datasets[0].backgroundColor = colors;
  protocolChart.update('none');
}

// ---------------------------------------------------------------------------
// Top Talkers Chart
// ---------------------------------------------------------------------------

function initTopTalkersChart() {
  const ctx = document.getElementById('top-talkers-chart').getContext('2d');
  topTalkersChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Sent',
          data: [],
          backgroundColor: 'rgba(0, 212, 255, 0.7)',
          borderColor: chartColors.cyan,
          borderWidth: 1,
          borderRadius: 3,
        },
        {
          label: 'Received',
          data: [],
          backgroundColor: 'rgba(255, 107, 53, 0.7)',
          borderColor: chartColors.orange,
          borderWidth: 1,
          borderRadius: 3,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: {
          position: 'top',
          labels: { usePointStyle: true, padding: 16, boxWidth: 8 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${formatBytes(ctx.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: chartColors.grid },
          ticks: {
            callback: (v) => formatBytes(v),
            maxTicksLimit: 6,
          },
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: {
            font: { size: 11 },
          },
        },
      },
    },
  });
}

function updateTopTalkers(topIps) {
  if (!topTalkersChart || !topIps) return;
  const labels = topIps.map(ip => ip.ip);
  const sent = topIps.map(ip => ip.bytes_sent || 0);
  const recv = topIps.map(ip => ip.bytes_received || 0);

  topTalkersChart.data.labels = labels;
  topTalkersChart.data.datasets[0].data = sent;
  topTalkersChart.data.datasets[1].data = recv;
  topTalkersChart.update('none');
}

// ---------------------------------------------------------------------------
// Ports Chart (Horizontal Bar)
// ---------------------------------------------------------------------------

function initPortsChart() {
  const ctx = document.getElementById('ports-chart').getContext('2d');
  portsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: [],
      datasets: [{
        label: 'Traffic',
        data: [],
        backgroundColor: 'rgba(168, 85, 247, 0.7)',
        borderColor: '#a855f7',
        borderWidth: 1,
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => {
              const label = items[0]?.label || '';
              return label;
            },
            label: (ctx) => `Traffic: ${formatBytes(ctx.parsed.x)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: chartColors.grid },
          ticks: { callback: (v) => formatBytes(v), maxTicksLimit: 5 },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11 } },
        },
      },
    },
  });
}

function initPortProtocolChart() {
  const ctx = document.getElementById('port-protocol-chart').getContext('2d');
  portProtocolChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
        borderColor: '#12122a',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { usePointStyle: true, padding: 12, boxWidth: 10 },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return `${ctx.label}: ${formatBytes(ctx.parsed)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

const portBarColors = [
  '#a855f7','#8b5cf6','#7c3aed','#6d28d9','#5b21b6',
  '#c084fc','#d8b4fe','#e9d5ff','#9333ea','#7e22ce',
  '#6366f1','#818cf8','#a5b4fc','#4f46e5','#4338ca',
];

function updatePorts(ports) {
  if (!portsChart || !ports || ports.length === 0) return;
  const labels = ports.map(p => `${p.port} (${getPortService(p.port)})`);
  const data = ports.map(p => p.bytes);

  portsChart.data.labels = labels;
  portsChart.data.datasets[0].data = data;
  portsChart.data.datasets[0].backgroundColor = ports.map((_, i) => portBarColors[i % portBarColors.length]);
  portsChart.update('none');

  // Aggregate by protocol for the port-protocol doughnut
  if (!portProtocolChart) return;
  const protoAgg = {};
  ports.forEach(p => {
    const proto = p.protocol || 'Other';
    protoAgg[proto] = (protoAgg[proto] || 0) + p.bytes;
  });
  const protoLabels = Object.keys(protoAgg);
  const protoData = Object.values(protoAgg);
  const protoColors = protoLabels.map(getProtocolColor);

  portProtocolChart.data.labels = protoLabels;
  portProtocolChart.data.datasets[0].data = protoData;
  portProtocolChart.data.datasets[0].backgroundColor = protoColors;
  portProtocolChart.update('none');
}

// ---------------------------------------------------------------------------
// World Map (Leaflet)
// ---------------------------------------------------------------------------

function initMap() {
  leafletMap = L.map('world-map', {
    center: [30, 0],
    zoom: 2,
    zoomControl: true,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 18,
    subdomains: 'abcd',
  }).addTo(leafletMap);

  // Fix Leaflet rendering in Electron by invalidating size after layout
  setTimeout(() => leafletMap.invalidateSize(), 500);
}

function updateMapMarkers(ips) {
  if (!leafletMap) return;

  // Remove old markers
  mapMarkers.forEach(m => leafletMap.removeLayer(m));
  mapMarkers = [];

  if (!ips || ips.length === 0) return;

  // Compute max bytes for scaling
  const maxBytes = Math.max(...ips.map(ip => (ip.bytes_sent || 0) + (ip.bytes_received || 0)), 1);

  ips.forEach(ip => {
    const geo = ip.geo;
    if (!geo || !geo.lat || !geo.lon) return;
    if (geo.country === 'Private') return;

    const totalBytes = (ip.bytes_sent || 0) + (ip.bytes_received || 0);
    const radius = Math.max(4, Math.min(25, (totalBytes / maxBytes) * 25));

    const marker = L.circleMarker([geo.lat, geo.lon], {
      radius: radius,
      fillColor: chartColors.cyan,
      color: 'rgba(0, 212, 255, 0.4)',
      weight: 2,
      fillOpacity: 0.6,
    });

    marker.bindPopup(`
      <div style="font-family: 'Segoe UI', sans-serif; font-size: 12px; line-height: 1.5; color: #222;">
        <strong>${ip.ip}</strong><br/>
        ${geo.country || '?'}, ${geo.city || '?'}<br/>
        ISP: ${geo.isp || 'Unknown'}<br/>
        Sent: ${formatBytes(ip.bytes_sent)}<br/>
        Recv: ${formatBytes(ip.bytes_received)}
      </div>
    `);

    marker.addTo(leafletMap);
    mapMarkers.push(marker);
  });
}

// ---------------------------------------------------------------------------
// Summary Cards
// ---------------------------------------------------------------------------

function updateSummary(summary) {
  if (!summary) return;
  dom.totalIn.textContent = formatBytes(summary.total_bytes_in);
  dom.totalOut.textContent = formatBytes(summary.total_bytes_out);
  dom.activeIps.textContent = formatNumber(summary.active_ips);
  dom.totalPackets.textContent = formatNumber(summary.total_packets);
  dom.uptime.textContent = formatUptime(summary.uptime);
}

// ---------------------------------------------------------------------------
// IP Table
// ---------------------------------------------------------------------------

function updateTable(ips) {
  if (!ips) return;
  ipData = ips;
  dom.ipCount.textContent = `${ips.length} IPs`;
  renderTable();
}

function renderTable() {
  const sorted = [...ipData].sort((a, b) => {
    let va = getNestedVal(a, sortColumn);
    let vb = getNestedVal(b, sortColumn);

    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();

    if (va < vb) return sortDirection === 'asc' ? -1 : 1;
    if (va > vb) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  if (sorted.length === 0) {
    dom.ipTableBody.innerHTML = '<tr><td colspan="8" class="table-empty">No connections yet</td></tr>';
    return;
  }

  dom.ipTableBody.innerHTML = sorted.map(ip => {
    const geo = ip.geo || {};
    return `<tr class="ip-row" data-ip="${escapeHtml(ip.ip)}">
      <td class="cell-ip">${escapeHtml(ip.ip)}</td>
      <td>${formatBytes(ip.bytes_sent)}</td>
      <td>${formatBytes(ip.bytes_received)}</td>
      <td>${formatNumber(ip.packets_sent)}</td>
      <td>${formatNumber(ip.packets_received)}</td>
      <td>${escapeHtml(geo.country || '--')}</td>
      <td>${escapeHtml(geo.city || '--')}</td>
      <td>${escapeHtml(geo.isp || '--')}</td>
    </tr>`;
  }).join('');

  // Attach click handlers for IP detail modal
  dom.ipTableBody.querySelectorAll('.ip-row').forEach(row => {
    row.addEventListener('click', () => openIpModal(row.dataset.ip));
  });
}

function getNestedVal(obj, key) {
  if (key === 'country' || key === 'city' || key === 'isp') {
    return (obj.geo && obj.geo[key]) || '';
  }
  return obj[key] || 0;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Table header sorting
document.querySelectorAll('#ip-table th[data-sort]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.getAttribute('data-sort');
    if (sortColumn === col) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = col;
      sortDirection = 'desc';
    }

    // Update sort arrows
    document.querySelectorAll('#ip-table th').forEach(h => h.classList.remove('sort-asc', 'sort-desc'));
    th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');

    renderTable();
  });
});

// ---------------------------------------------------------------------------
// IP Details Modal
// ---------------------------------------------------------------------------

const modal = document.getElementById('ip-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalBackdrop = modal ? modal.querySelector('.modal-backdrop') : null;

function openIpModal(ip) {
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('modal-ip-title').textContent = ip;

  // Clear previous data
  ['modal-bytes-sent','modal-bytes-recv','modal-pkts-sent','modal-pkts-recv',
   'modal-first-seen','modal-last-seen','modal-country','modal-city',
   'modal-isp','modal-org','modal-asn','modal-coords'].forEach(id => {
    document.getElementById(id).textContent = 'Loading...';
  });
  document.getElementById('modal-protocols').innerHTML = '';
  document.getElementById('modal-ports-body').innerHTML = '<tr><td colspan="5" class="table-empty">Loading...</td></tr>';

  // Fetch detailed data
  fetchJSON(`/api/ips/${ip}/details`).then(data => {
    if (!data) return;
    document.getElementById('modal-bytes-sent').textContent = formatBytes(data.bytes_sent);
    document.getElementById('modal-bytes-recv').textContent = formatBytes(data.bytes_received);
    document.getElementById('modal-pkts-sent').textContent = formatNumber(data.packets_sent);
    document.getElementById('modal-pkts-recv').textContent = formatNumber(data.packets_received);
    document.getElementById('modal-first-seen').textContent = formatTimestamp(data.first_seen);
    document.getElementById('modal-last-seen').textContent = formatTimestamp(data.last_seen);

    const geo = data.geo || {};
    document.getElementById('modal-country').textContent = geo.country || '--';
    document.getElementById('modal-city').textContent = geo.city || '--';
    document.getElementById('modal-isp').textContent = geo.isp || '--';
    document.getElementById('modal-org').textContent = geo.org || '--';
    document.getElementById('modal-asn').textContent = geo.as || '--';
    document.getElementById('modal-coords').textContent =
      (geo.lat && geo.lon) ? `${geo.lat}, ${geo.lon}` : '--';

    // Protocol bars
    const protoEl = document.getElementById('modal-protocols');
    if (data.protocols && Object.keys(data.protocols).length > 0) {
      const maxVal = Math.max(...Object.values(data.protocols));
      protoEl.innerHTML = Object.entries(data.protocols).map(([proto, bytes]) => {
        const pct = maxVal > 0 ? (bytes / maxVal * 100) : 0;
        const color = getProtocolColor(proto);
        return `<div class="proto-bar-row">
          <span class="proto-bar-label">${escapeHtml(proto)}</span>
          <div class="proto-bar-track"><div class="proto-bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="proto-bar-value">${formatBytes(bytes)}</span>
        </div>`;
      }).join('');
    } else {
      protoEl.innerHTML = '<div class="table-empty">No protocol data</div>';
    }

    // Ports table
    const portsBody = document.getElementById('modal-ports-body');
    if (data.ports && data.ports.length > 0) {
      portsBody.innerHTML = data.ports.map(p =>
        `<tr>
          <td class="cell-ip">${p.port}</td>
          <td>${escapeHtml(getPortService(p.port))}</td>
          <td>${escapeHtml(p.protocol || '--')}</td>
          <td>${formatBytes(p.bytes)}</td>
          <td>${formatNumber(p.packets)}</td>
        </tr>`
      ).join('');
    } else {
      portsBody.innerHTML = '<tr><td colspan="5" class="table-empty">No port data</td></tr>';
    }
  });
}

function closeIpModal() {
  if (modal) modal.classList.add('hidden');
}

if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeIpModal);
if (modalBackdrop) modalBackdrop.addEventListener('click', closeIpModal);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeIpModal();
});

// ---------------------------------------------------------------------------
// REST API Fetching
// ---------------------------------------------------------------------------

async function fetchJSON(endpoint) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`Fetch ${endpoint} failed:`, err.message);
    return null;
  }
}

async function initialLoad() {
  const [summary, ips, topIps, protocols, timeline, ports] = await Promise.all([
    fetchJSON('/api/summary'),
    fetchJSON('/api/ips'),
    fetchJSON('/api/top?limit=10'),
    fetchJSON('/api/protocols'),
    fetchJSON('/api/timeline'),
    fetchJSON('/api/ports?limit=15'),
  ]);

  if (summary) {
    hideOverlay();
    updateSummary(summary);
  }
  if (ips) {
    updateTable(ips);
    updateMapMarkers(ips);
  }
  if (topIps) updateTopTalkers(topIps);
  if (protocols) updateProtocols(protocols);
  if (timeline) loadFullTimeline(timeline);
  if (ports) updatePorts(ports);
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    setConnected(true);
    hideOverlay();
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'update') {
        handleWSUpdate(msg);
      }
    } catch (err) {
      console.warn('WS message parse error:', err);
    }
  };

  ws.onclose = () => {
    setConnected(false);
    scheduleReconnect();
  };

  ws.onerror = () => {
    setConnected(false);
    ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setInterval(() => {
    connectWebSocket();
  }, 3000);
}

function handleWSUpdate(msg) {
  if (msg.summary) updateSummary(msg.summary);
  if (msg.top_ips) updateTopTalkers(msg.top_ips);
  if (msg.protocols) updateProtocols(msg.protocols);
  if (msg.ports) updatePorts(msg.ports);
  if (msg.timeline_point) updateTimeline(msg.timeline_point);

  // Update the last-update timestamp
  dom.lastUpdate.textContent = 'Last update: ' + new Date().toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// Periodic Refreshes
// ---------------------------------------------------------------------------

// Refresh IP table every 5s via REST
setInterval(async () => {
  const ips = await fetchJSON('/api/ips');
  if (ips) updateTable(ips);
}, 5000);

// Refresh map markers every 10s via REST
setInterval(async () => {
  const ips = await fetchJSON('/api/ips');
  if (ips) updateMapMarkers(ips);
}, 10000);

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initTimelineChart();
  initProtocolChart();
  initTopTalkersChart();
  initPortsChart();
  initPortProtocolChart();
  initMap();

  // Attempt initial data load, then connect WebSocket
  initialLoad().then(() => {
    connectWebSocket();
  }).catch(() => {
    // If initial load fails, still try WebSocket (backend might come up)
    connectWebSocket();
  });
});
