import { app, BrowserWindow, globalShortcut, session, desktopCapturer, screen, ipcMain, Tray, Menu, nativeImage } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { fork } from 'child_process';
import http from 'http';
import { autoUpdater } from 'electron-updater';
import logger from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let cloudBrainProcess = null;
let localHandsProcess = null;
let tray = null;

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.size;

  mainWindow = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true, // Useful for the widget to float over other apps
    skipTaskbar: true, // Since it's a widget, optionally hide from taskbar
    resizable: false,
    show: false, // Hidden by default, relying on the system tray
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'public', 'index.html'));
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('console-message', (event, details, ...args) => {
    logger.info(`[Browser Console] details: ${JSON.stringify(details)} args: ${JSON.stringify(args)}`);
  });
}

function startBackgroundProcesses() {
  const cloudBrainPath = path.join(__dirname, '../../cloud-brain/server.js');
  const localHandsPath = path.join(__dirname, '../../local-hands/daemon.js');

  logger.info(`Starting Cloud Brain from ${cloudBrainPath}`);
  cloudBrainProcess = fork(cloudBrainPath, [], {
    cwd: path.join(__dirname, '../../cloud-brain'),
    stdio: 'inherit' // Inherit stdio so we can see any startup errors in the terminal
  });

  cloudBrainProcess.on('error', (err) => {
    logger.error(`Cloud Brain process error: ${err.message}`);
  });

  logger.info(`Starting Local Hands from ${localHandsPath}`);
  localHandsProcess = fork(localHandsPath, [], {
    cwd: path.join(__dirname, '../../local-hands'),
    stdio: 'inherit'
  });

  localHandsProcess.on('error', (err) => {
    logger.error(`Local Hands process error: ${err.message}`);
  });
}

function checkHealth(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => {
      resolve(res.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

function startHealthPolling() {
  setInterval(async () => {
    const cloudBrainHealth = await checkHealth('http://localhost:3000/health');
    const localHandsHealth = await checkHealth('http://localhost:3001/health');
    
    // Dispatch to renderer
    if (mainWindow) {
      mainWindow.webContents.send('health-status', {
        cloudBrain: cloudBrainHealth,
        localHands: localHandsHealth
      });
    }
    
    if (!cloudBrainHealth) logger.warn('Cloud Brain health check failed');
    if (!localHandsHealth) logger.warn('Local Hands health check failed');
  }, 5000);
}

function createTray() {
  // Create a 16x16 red square as a fallback icon for the tray
  const iconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2P8z8Dwn4EKAAMjQxQNHsOowcNQDDQAAAAA//8hL3wKAAAAAElFTkSuQmCC';
  const icon = nativeImage.createFromBuffer(Buffer.from(iconBase64, 'base64'));
  
  tray = new Tray(icon);
  tray.setToolTip('J.A.R.V.I.S.');
  
  const loginSettings = app.getLoginItemSettings();
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show/Hide Widget',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) mainWindow.hide();
          else mainWindow.show();
        }
      }
    },
    {
      label: 'Auto-Start on Boot',
      type: 'checkbox',
      checked: loginSettings.openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked
        });
        logger.info(`Auto-start set to: ${menuItem.checked}`);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Grant access to the first screen found.
      callback({ video: sources[0], audio: 'loopback' });
    }).catch((err) => {
      logger.error(`Error getting sources: ${err.message}`);
    });
  });

  startBackgroundProcesses();
  createWindow();
  startHealthPolling();
  createTray();

  // Check for updates
  autoUpdater.logger = logger;
  autoUpdater.checkForUpdatesAndNotify();

  // Register a global shortcut that shouldn't clash (Ctrl+Alt+Shift+J)
  const ret = globalShortcut.register('CommandOrControl+Alt+Shift+J', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        if (mainWindow.isFocused()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });

  if (!ret) {
    logger.warn('Global shortcut registration failed');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      win.setIgnoreMouseEvents(ignore, options);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  
  if (cloudBrainProcess) {
    logger.info('Shutting down Cloud Brain...');
    cloudBrainProcess.kill();
  }
  if (localHandsProcess) {
    logger.info('Shutting down Local Hands...');
    localHandsProcess.kill();
  }
});
