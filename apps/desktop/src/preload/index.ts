import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { IPC_CHANNELS, type NormalizedAiEvent, type WhiteboardApi, type WindowMode } from '../main/contracts';

/**
 * The preload bridge is intentionally narrow. No ipcRenderer, Electron module,
 * Node primitive, or arbitrary channel name crosses into the renderer.
 */
function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

function subscribe<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T): void => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: WhiteboardApi = {
  app: {
    info: () => invoke(IPC_CHANNELS.appInfo),
    quit: () => invoke(IPC_CHANNELS.appQuit),
  },
  window: {
    getMode: () => invoke(IPC_CHANNELS.windowGetMode),
    setMode: (mode: WindowMode) => invoke(IPC_CHANNELS.windowSetMode, { mode }),
    toggle: () => invoke(IPC_CHANNELS.windowToggle),
    show: (mode?: WindowMode) => invoke(IPC_CHANNELS.windowShow, mode ? { mode } : undefined),
    hide: () => invoke(IPC_CHANNELS.windowHide),
    onModeChanged: (listener) => subscribe(IPC_CHANNELS.windowModeChanged, listener),
  },
  sessions: {
    list: () => invoke(IPC_CHANNELS.sessionsList),
    get: (id) => invoke(IPC_CHANNELS.sessionsGet, { id }),
    create: (input) => invoke(IPC_CHANNELS.sessionsCreate, input),
    rename: (id, title) => invoke(IPC_CHANNELS.sessionsRename, { id, title }),
    save: (input) => invoke(IPC_CHANNELS.sessionsSave, input),
    autosave: (input) => invoke(IPC_CHANNELS.sessionsAutosave, input),
    remove: (id) => invoke(IPC_CHANNELS.sessionsDelete, { id }),
    export: (id) => invoke(IPC_CHANNELS.sessionsExport, { id }),
    import: () => invoke(IPC_CHANNELS.sessionsImport),
  },
  settings: {
    get: () => invoke(IPC_CHANNELS.settingsGet),
    update: (patch) => invoke(IPC_CHANNELS.settingsUpdate, patch),
  },
  secrets: {
    has: (provider) => invoke(IPC_CHANNELS.secretHas, { provider }),
    set: (provider, apiKey) => invoke(IPC_CHANNELS.secretSet, { provider, apiKey }),
    remove: (provider) => invoke(IPC_CHANNELS.secretDelete, { provider }),
    configuredProviders: () => invoke(IPC_CHANNELS.secretProviders),
  },
  clipboard: {
    read: () => invoke(IPC_CHANNELS.clipboardRead),
    write: (input) => invoke(IPC_CHANNELS.clipboardWrite, input),
  },
  dialogs: {
    save: (options) => invoke(IPC_CHANNELS.dialogSave, options),
    open: (options) => invoke(IPC_CHANNELS.dialogOpen, options),
    saveFile: (options) => invoke(IPC_CHANNELS.dialogSaveFile, options),
    exportPdf: (options) => invoke(IPC_CHANNELS.dialogExportPdf, options),
  },
  ai: {
    start: (input) => invoke(IPC_CHANNELS.aiStart, input),
    cancel: (requestId) => invoke(IPC_CHANNELS.aiCancel, { requestId }),
    onEvent: (listener: (event: NormalizedAiEvent) => void) => subscribe(IPC_CHANNELS.aiEvent, listener),
  },
};

if (!process.contextIsolated) {
  // A renderer without context isolation would invalidate the security model;
  // fail closed instead of silently exposing a weaker bridge.
  throw new Error('AI Whiteboard requires Electron contextIsolation');
}

contextBridge.exposeInMainWorld('whiteboard', api);
contextBridge.exposeInMainWorld('aiWhiteboard', api);
