const { app, BrowserWindow, ipcMain, nativeTheme, session } = require('electron');
const path = require('path');
const { initAutoUpdates } = require('./updater');

let mainWindow = null;

// Электрон по умолчанию отклоняет запросы на доступ к микрофону/камере —
// это осознанная настройка безопасности, которую нужно явно ослабить для
// голосовых каналов (LiveKit publish'ит аудио-трек с реального микрофона).
// Разрешаем только 'media' и только нашему же приложению (permission
// request handler получает origin запроса — для file://-страницы
// приложения это безопасно, т.к. мы не грузим сторонний контент).
function setupMediaPermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
      return;
    }
    callback(false);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#15161C',
    title: 'Voice Nexus',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
}

app.whenReady().then(() => {
  setupMediaPermissions();
  createWindow();

  // Проверка обновлений молчит в режиме разработки (npm start) — это
  // штатное поведение electron-updater, см. комментарий в updater.js.
  if (app.isPackaged) {
    initAutoUpdates(mainWindow);
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

// Простой IPC для управления окном (сворачивание/разворачивание/закрытие),
// т.к. меню-бар скрыт и приложение использует кастомный заголовок.
ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:toggleMaximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('app:getVersion', () => app.getVersion());
