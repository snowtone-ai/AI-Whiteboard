import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  globalShortcut,
  nativeImage,
  screen,
  session,
  type Display,
  type Rectangle,
  type WebContents,
} from 'electron';

import {
  DEFAULT_WINDOW_MODE,
  IPC_CHANNELS,
  type WindowMode,
} from './contracts';

export interface WindowManagerOptions {
  preloadPath?: string;
  rendererUrl?: string;
  rendererFile?: string;
  initialMode?: WindowMode;
  alwaysOnTop?: boolean;
  onModeChanged?: (mode: WindowMode) => void | Promise<void>;
  onShortcutChanged?: (accelerator: string) => void | Promise<void>;
}

const TRANSPARENT_TRAY_ICON =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

/**
 * Owns the one renderer window, tray, global shortcut and placement policy.
 * Renderer content is treated as untrusted even though it is shipped with the
 * application: all navigation and window-open attempts are denied by default.
 */
export class WindowManager {
  private window: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private mode: WindowMode;
  private alwaysOnTop: boolean;
  private shortcut?: string;
  private trustedOrigin?: string;
  private readonly rendererUrl?: string;
  private readonly rendererFile: string;
  private readonly preloadPath: string;
  private readonly onModeChanged?: (mode: WindowMode) => void | Promise<void>;
  private readonly onShortcutChanged?: (accelerator: string) => void | Promise<void>;
  private quitting = false;

  constructor(options: WindowManagerOptions = {}) {
    this.mode = options.initialMode ?? DEFAULT_WINDOW_MODE;
    this.alwaysOnTop = options.alwaysOnTop ?? true;
    this.rendererUrl = options.rendererUrl ?? process.env.ELECTRON_RENDERER_URL ?? process.env.WHITEBOARD_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL;
    this.rendererFile = options.rendererFile ?? join(__dirname, '../renderer/index.html');
    this.preloadPath = options.preloadPath ?? join(__dirname, '../preload/index.cjs');
    this.onModeChanged = options.onModeChanged;
    this.onShortcutChanged = options.onShortcutChanged;
    if (this.rendererUrl) {
      try {
        this.trustedOrigin = new URL(this.rendererUrl).origin;
      } catch {
        this.trustedOrigin = undefined;
      }
    }
    this.installCspHeader();
    this.createTray();
  }

  getMainWindow(): BrowserWindow | null {
    return this.window;
  }

  getMode(): WindowMode {
    return this.mode;
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  /** Main-process IPC handlers call this before accepting any renderer data. */
  isTrustedSender(event: { sender: WebContents; senderFrame?: { url: string; routingId: number } | null }): boolean {
    const current = this.window;
    if (!current || event.sender !== current.webContents) return false;
    const frame = event.senderFrame;
    if (!frame || frame.routingId !== current.webContents.mainFrame.routingId) return false;
    return this.isTrustedUrl(frame.url);
  }

  async create(): Promise<BrowserWindow> {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = new BrowserWindow({
      width: 720,
      height: 210,
      minWidth: 360,
      minHeight: 120,
      show: false,
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        navigateOnDragDrop: false,
        spellcheck: true,
      },
    });
    this.window = window;
    window.setAlwaysOnTop(this.alwaysOnTop, 'floating');
    window.setMenuBarVisibility(false);

    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event, url) => {
      if (!this.isTrustedUrl(url)) event.preventDefault();
    });
    window.webContents.on('did-redirect-navigation', (event, url) => {
      if (!this.isTrustedUrl(url)) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', (event) => {
      event.preventDefault();
    });
    window.on('close', (event) => {
      if (!this.quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    window.on('closed', () => {
      if (this.window === window) this.window = null;
    });
    window.once('ready-to-show', () => {
      this.positionForMode(this.mode);
      this.showWindow();
    });

    if (this.rendererUrl && this.trustedOrigin) {
      await window.loadURL(this.rendererUrl);
    } else {
      // Packaged apps use loadFile because no local HTTP server is available.
      // The file URL is restricted to this known renderer entry by isTrustedUrl.
      await window.loadFile(this.rendererFile);
    }
    this.positionForMode(this.mode);
    return window;
  }

  async show(mode = this.mode): Promise<void> {
    await this.create();
    await this.setMode(mode, false);
    this.showWindow();
  }

  hide(): void {
    this.window?.hide();
  }

  async toggle(): Promise<boolean> {
    if (this.isVisible()) {
      this.hide();
      return false;
    }
    await this.show('quick');
    return true;
  }

  async setMode(mode: WindowMode, notify = true): Promise<WindowMode> {
    this.mode = mode;
    if (this.window && !this.window.isDestroyed()) {
      this.positionForMode(mode);
      this.window.webContents.send(IPC_CHANNELS.windowModeChanged, mode);
    }
    if (notify) await this.onModeChanged?.(mode);
    return mode;
  }

  setAlwaysOnTop(value: boolean): void {
    this.alwaysOnTop = value;
    if (this.window && !this.window.isDestroyed()) this.window.setAlwaysOnTop(value, 'floating');
  }

  async setGlobalShortcut(accelerator: string): Promise<boolean> {
    const previous = this.shortcut;
    if (previous === accelerator) return true;
    if (previous) globalShortcut.unregister(previous);
    const registered = globalShortcut.register(accelerator, () => {
      void this.toggle();
    });
    if (!registered) {
      if (previous) globalShortcut.register(previous, () => void this.toggle());
      return false;
    }
    this.shortcut = accelerator;
    await this.onShortcutChanged?.(accelerator);
    return true;
  }

  registerGlobalShortcut(accelerator: string): boolean {
    if (this.shortcut) globalShortcut.unregister(this.shortcut);
    const registered = globalShortcut.register(accelerator, () => void this.toggle());
    if (registered) this.shortcut = accelerator;
    return registered;
  }

  /** Called from app.before-quit so the close handler does not hide the window. */
  beginShutdown(): void {
    this.quitting = true;
    if (this.shortcut) {
      globalShortcut.unregister(this.shortcut);
      this.shortcut = undefined;
    }
    this.tray?.destroy();
    this.tray = null;
  }

  /** Shared validation for IPC sender and navigation policies. */
  isTrustedUrl(url: string): boolean {
    if (this.rendererUrl && this.trustedOrigin) {
      try {
        const parsed = new URL(url);
        return parsed.origin === this.trustedOrigin && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
      } catch {
        return false;
      }
    }
    try {
      const path = resolve(fileURLToPath(url));
      return path === resolve(this.rendererFile);
    } catch {
      return false;
    }
  }

  private showWindow(): void {
    const window = this.window;
    if (!window || window.isDestroyed()) return;
    this.positionForMode(this.mode);
    if (!window.isVisible()) window.show();
    window.focus();
  }

  private positionForMode(mode: WindowMode): void {
    const window = this.window;
    if (!window || window.isDestroyed() || !screen.getAllDisplays().length) return;
    const display = this.activeDisplay();
    const bounds = this.boundsForMode(mode, display);
    window.setBounds(bounds, false);
    window.setAlwaysOnTop(this.alwaysOnTop, 'floating');
  }

  private activeDisplay(): Display {
    const cursor = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursor);
  }

  private boundsForMode(mode: WindowMode, display: Display): Rectangle {
    const area = display.workArea;
    if (mode === 'full') return { ...area };
    if (mode === 'dock') {
      const width = Math.min(460, Math.max(360, Math.floor(area.width * 0.3)));
      return { x: area.x + area.width - width, y: area.y, width, height: area.height };
    }
    if (mode === 'inspect') {
      const width = Math.min(620, Math.max(420, Math.floor(area.width * 0.38)));
      const height = Math.min(area.height, Math.max(520, Math.floor(area.height * 0.85)));
      return {
        x: area.x + area.width - width - 18,
        y: area.y + Math.max(0, Math.floor((area.height - height) / 2)),
        width,
        height,
      };
    }
    const width = Math.min(760, Math.max(420, Math.floor(area.width * 0.55)));
    const height = 220;
    return {
      x: area.x + Math.max(0, Math.floor((area.width - width) / 2)),
      y: area.y + Math.max(20, Math.floor(area.height * 0.15)),
      width,
      height,
    };
  }

  private createTray(): void {
    if (this.tray || !app.isReady()) return;
    this.tray = new Tray(nativeImage.createFromDataURL(TRANSPARENT_TRAY_ICON));
    this.tray.setToolTip('AI Whiteboard');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Quick mode', click: () => void this.show('quick') },
        { label: 'Full board', click: () => void this.show('full') },
        { label: 'Dock', click: () => void this.show('dock') },
        { label: 'Inspect', click: () => void this.show('inspect') },
        { type: 'separator' },
        { label: 'Hide', click: () => this.hide() },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
    this.tray.on('click', () => void this.toggle());
  }

  private installCspHeader(): void {
    if (!session.defaultSession) return;
    const developmentConnect = this.trustedOrigin
      ? ` ${this.trustedOrigin} ${this.trustedOrigin.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}`
      : '';
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const responseHeaders = details.responseHeaders ?? {};
      const existing = responseHeaders['Content-Security-Policy'] ?? responseHeaders['content-security-policy'];
      if (!existing) {
        responseHeaders['Content-Security-Policy'] = [
          `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'${developmentConnect}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
        ];
      }
      callback({ responseHeaders });
    });
  }
}
