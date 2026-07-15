import { app, BrowserWindow, globalShortcut, session, desktopCapturer } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

// Start the backend server
import './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false, // Frameless window as requested
    transparent: true, // Allows for cool HUD effects if CSS supports it
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Wait a moment for Express server to start, then load URL
  setTimeout(() => {
    mainWindow.loadURL('http://localhost:3000');
  }, 1000);
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      // Grant access to the first screen found.
      callback({ video: sources[0], audio: 'loopback' });
    }).catch((err) => {
      console.error('Error getting sources:', err);
    });
  });

  createWindow();

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
    console.warn('Global shortcut registration failed');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
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
});
