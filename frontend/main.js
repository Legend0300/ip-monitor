const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

let mainWindow = null;
let pythonProcess = null;
const isDev = process.argv.includes('--dev');
const BACKEND_URL = 'http://localhost:8420';

function pollBackend(maxAttempts = 20, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    function check() {
      attempts++;
      const req = http.get(`${BACKEND_URL}/api/summary`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Backend returned non-200 status'));
        }
      });

      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Backend did not become ready in time'));
        }
      });

      req.setTimeout(2000, () => {
        req.destroy();
        if (attempts < maxAttempts) {
          setTimeout(check, interval);
        } else {
          reject(new Error('Backend connection timed out'));
        }
      });
    }

    check();
  });
}

function startBackend() {
  const backendDir = path.join(__dirname, '..', 'backend');
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

  try {
    pythonProcess = spawn(pythonCmd, ['app.py'], {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    pythonProcess.stdout.on('data', (data) => {
      if (isDev) console.log(`[backend] ${data.toString().trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      if (isDev) console.error(`[backend] ${data.toString().trim()}`);
    });

    pythonProcess.on('error', (err) => {
      console.error('Failed to start Python backend:', err.message);
      dialog.showErrorBox(
        'Backend Error',
        `Could not start the Python backend.\n\nMake sure Python is installed and available in your PATH.\n\nError: ${err.message}`
      );
      app.quit();
    });

    pythonProcess.on('exit', (code, signal) => {
      if (isDev) {
        console.log(`Backend exited with code ${code}, signal ${signal}`);
      }
      pythonProcess = null;
    });
  } catch (err) {
    dialog.showErrorBox(
      'Backend Error',
      `Failed to spawn Python process.\n\nError: ${err.message}`
    );
    app.quit();
  }
}

function killBackend() {
  if (pythonProcess) {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid.toString(), '/f', '/t'], {
        windowsHide: true
      });
    } else {
      pythonProcess.kill('SIGTERM');
    }
    pythonProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0a0a1a',
    autoHideMenuBar: true,
    title: 'IP Monitor',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile('index.html');

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  startBackend();

  try {
    await pollBackend();
  } catch (err) {
    console.warn('Backend polling finished without confirmed ready state, proceeding anyway...');
  }

  createWindow();
});

app.on('window-all-closed', () => {
  killBackend();
  app.quit();
});

app.on('before-quit', () => {
  killBackend();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
