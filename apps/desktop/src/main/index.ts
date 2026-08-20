import { app } from 'electron';

import { ProviderManager } from './providers';
import { IpcController } from './ipc';
import { AtomicDatabase, EncryptedSecretsStore, defaultStoragePaths } from './storage';
import { WindowManager } from './window';

let database: AtomicDatabase | undefined;
let secrets: EncryptedSecretsStore | undefined;
let windows: WindowManager | undefined;
let ipc: IpcController | undefined;
let shutdownStarted = false;

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    void windows?.show('quick');
  });

  void app.whenReady().then(async () => {
    const paths = defaultStoragePaths(app.getPath('userData'));
    database = await AtomicDatabase.open(paths);
    secrets = await EncryptedSecretsStore.open({ secretsPath: paths.secretsPath });
    const settings = database.getSettings();

    windows = new WindowManager({
      initialMode: settings.windowMode,
      alwaysOnTop: settings.alwaysOnTop,
      onModeChanged: async (mode) => {
        await database?.updateSettings({ windowMode: mode });
      },
      onShortcutChanged: async (globalShortcut) => {
        await database?.updateSettings({ globalShortcut });
      },
    });
    windows.registerGlobalShortcut(settings.globalShortcut);

    const providers = new ProviderManager((provider) => secrets?.get(provider));
    ipc = new IpcController({ database, secrets, providers, windows });
    ipc.register();
    await windows.create();
  }).catch((error: unknown) => {
    // Do not print provider keys or arbitrary renderer data. Electron will
    // still terminate cleanly if boot fails before a window is available.
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Application startup failed';
    console.error(`[AI Whiteboard] ${message}`);
    app.quit();
  });

  app.on('activate', () => {
    void windows?.show();
  });

  app.on('window-all-closed', () => {
    // The window is hidden instead of closed by WindowManager. This fallback
    // keeps the usual desktop behavior if the renderer crashes completely.
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', (event) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    event.preventDefault();
    void (async () => {
      await ipc?.shutdown();
      windows?.beginShutdown();
      await database?.close();
      await secrets?.close();
      app.quit();
    })();
  });
}

export { database, ipc, secrets, windows };
