const { contextBridge, ipcRenderer } = require('electron');

// Minimal preload — the renderer communicates directly with the backend
// via fetch and WebSocket on localhost. We expose a small bridge for
// any future IPC needs (e.g., native dialogs, window controls).

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
});
