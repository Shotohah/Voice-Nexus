// ============================================================================
// Vybe — авто-обновление "по воздуху" через electron-updater + GitHub Releases.
//
// Как это работает: при старте приложение обращается к GitHub API репозитория
// (publish.owner/repo из package.json), сверяет текущую версию (app.getVersion())
// с последним опубликованным релизом. Если есть новее — молча скачивает
// установщик в фоне и предлагает перезапуститься, чтобы применить обновление.
// Ничего не произойдёт, пока в GitHub Releases этого репозитория не появится
// релиз с версией выше текущей — на обычный push в ветку апдейтер не реагирует.
//
// Работает только в собранном (упакованном) приложении: в режиме разработки
// (npm start) electron-updater намеренно ничего не делает — это штатное
// поведение библиотеки, а не баг прототипа.
// ============================================================================

const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { dialog } = require('electron');

log.transports.file.level = 'info';
autoUpdater.logger = log;

// Не скачивать молча без ведома пользователя — после скачивания спросим,
// перезапускать ли приложение сейчас или позже. Это более честное поведение
// для прототипа, чем тихая принудительная установка.
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindowRef = null;

function initAutoUpdates(mainWindow) {
  mainWindowRef = mainWindow;

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] проверяю обновления…');
  });

  autoUpdater.on('update-available', (info) => {
    log.info(`[updater] найдена новая версия: ${info.version}`);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('[updater] установлена последняя версия');
  });

  autoUpdater.on('error', (err) => {
    // Нормальная ситуация в прототипе: если publish ещё не настроен или
    // релизов в репозитории нет, апдейтер просто не найдёт фид — это не
    // должно ронять приложение и не должно пугать пользователя диалогом.
    log.warn('[updater] ошибка проверки обновлений:', err == null ? 'unknown' : err.message);
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[updater] скачивание: ${Math.round(progress.percent)}%`);
    mainWindowRef?.webContents.send('updater:progress', Math.round(progress.percent));
  });

  autoUpdater.on('update-downloaded', async (info) => {
    log.info(`[updater] обновление ${info.version} скачано, жду подтверждения`);
    const result = await dialog.showMessageBox(mainWindowRef, {
      type: 'info',
      title: 'Доступно обновление',
      message: `Vybe ${info.version} готов к установке`,
      detail: 'Обновление уже скачано. Перезапустить сейчас, чтобы применить его?',
      buttons: ['Перезапустить сейчас', 'Позже'],
      defaultId: 0,
      cancelId: 1
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
    // При "Позже" обновление всё равно применится автоматически при
    // следующем обычном закрытии приложения — см. autoInstallOnAppQuit.
  });

  // Первая проверка — вскоре после старта, не блокируя открытие окна.
  checkNow();
}

function checkNow() {
  autoUpdater.checkForUpdates().catch((err) => {
    log.warn('[updater] checkForUpdates упал:', err?.message || err);
  });
}

module.exports = { initAutoUpdates, checkNow };
