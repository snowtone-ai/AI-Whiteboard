/**
 * Contracts shared by the Electron main process and the preload bridge.
 *
 * This file deliberately contains no Electron imports.  It is safe to import
 * as a type from a renderer/preload build and keeps the renderer from getting
 * access to Node or Electron implementation details.
 */

export const IPC_CHANNELS = {
  appInfo: 'app:info',
  appQuit: 'app:quit',
  windowGetMode: 'window:get-mode',
  windowSetMode: 'window:set-mode',
  windowToggle: 'window:toggle',
  windowShow: 'window:show',
  windowHide: 'window:hide',
  windowModeChanged: 'window:mode-changed',
  sessionsList: 'sessions:list',
  sessionsGet: 'sessions:get',
  sessionsCreate: 'sessions:create',
  sessionsRename: 'sessions:rename',
  sessionsSave: 'sessions:save',
  sessionsAutosave: 'sessions:autosave',
  sessionsDelete: 'sessions:delete',
  sessionsExport: 'sessions:export',
  sessionsImport: 'sessions:import',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  secretHas: 'secret:has',
  secretSet: 'secret:set',
  secretDelete: 'secret:delete',
  secretProviders: 'secret:providers',
  clipboardRead: 'clipboard:read',
  clipboardWrite: 'clipboard:write',
  dialogSave: 'dialog:save',
  dialogSaveFile: 'dialog:save-file',
  dialogExportPdf: 'dialog:export-pdf',
  dialogOpen: 'dialog:open',
  aiStart: 'ai:start',
  aiCancel: 'ai:cancel',
  aiEvent: 'ai:event',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export type WindowMode = 'quick' | 'full' | 'dock' | 'inspect';

export const DEFAULT_WINDOW_MODE: WindowMode = 'quick';
export const DEFAULT_GLOBAL_SHORTCUT = 'CommandOrControl+Shift+Space';

export type ProviderName = 'openai' | 'anthropic' | 'google';

export const DEFAULT_MODELS: Record<ProviderName, string> = {
  openai: 'gpt-5.6-luna',
  anthropic: 'claude-sonnet-5',
  google: 'gemini-3.7-flash',
};

export type AiRole = 'system' | 'user' | 'assistant';

export interface AiTextPart {
  type: 'text';
  text: string;
}

export interface AiImagePart {
  type: 'image';
  /** A data URL or base64 encoded image. Remote URLs are intentionally not accepted. */
  data: string;
  mimeType: string;
  alt?: string;
}

export type AiContentPart = AiTextPart | AiImagePart;

export interface AiMessage {
  role: AiRole;
  content: string | AiContentPart[];
}

export interface AiResponseFormat {
  type: 'text' | 'json';
  /** Optional JSON schema supplied to providers that support structured output. */
  schema?: Record<string, unknown>;
  name?: string;
}

export interface AiRequestInput {
  provider: ProviderName;
  model?: string;
  messages: AiMessage[];
  /** Structured board/document context, serialized by the main process. */
  context?: unknown;
  responseFormat?: AiResponseFormat;
  temperature?: number;
  maxOutputTokens?: number;
  sessionId?: string;
}

export interface AiRequestRecord {
  id: string;
  sessionId?: string;
  provider: ProviderName;
  model: string;
  status: 'running' | 'completed' | 'cancelled' | 'error';
  createdAt: string;
  completedAt?: string;
  usage?: AiUsage;
  error?: SafeError;
}

export interface AiUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export type NormalizedAiEvent =
  | {
      type: 'text-delta';
      requestId: string;
      provider: ProviderName;
      delta: string;
    }
  | {
      type: 'structured';
      requestId: string;
      provider: ProviderName;
      value: unknown;
    }
  | {
      type: 'image';
      requestId: string;
      provider: ProviderName;
      mimeType: string;
      data: string;
    }
  | {
      type: 'usage';
      requestId: string;
      provider: ProviderName;
      usage: AiUsage;
    }
  | {
      type: 'done';
      requestId: string;
      provider: ProviderName;
      stopReason?: string;
    }
  | {
      type: 'error';
      requestId: string;
      provider: ProviderName;
      error: SafeError;
    };

export interface SafeError {
  code: string;
  message: string;
  retryable?: boolean;
  provider?: ProviderName;
}

export interface BoardSession {
  id: string;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Board state is intentionally opaque to the desktop shell. */
  document: unknown;
  metadata?: Record<string, unknown>;
}

export interface SessionSnapshot {
  id: string;
  sessionId: string;
  version: number;
  createdAt: string;
  document: unknown;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  version: number;
  type: string;
  createdAt: string;
  payload: unknown;
}

export interface AppSettings {
  version: number;
  windowMode: WindowMode;
  globalShortcut: string;
  activeProvider: ProviderName;
  models: Record<ProviderName, string>;
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  autosaveIntervalMs: number;
}

export type AppSettingsPatch = Omit<Partial<AppSettings>, 'version' | 'models'> & {
  models?: Partial<Record<ProviderName, string>>;
};

export interface DatabaseState {
  version: 1;
  sessions: BoardSession[];
  snapshots: SessionSnapshot[];
  events: SessionEvent[];
  aiRequests: AiRequestRecord[];
  settings: AppSettings;
}

export interface ClipboardPayload {
  text: string;
  /** PNG data URL, or undefined when the clipboard has no image. */
  imageDataUrl?: string;
}

export interface ClipboardWriteInput {
  text?: string;
  /** A data URL accepted by Electron's nativeImage. */
  imageDataUrl?: string;
}

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  arch: string;
  isPackaged: boolean;
}

export interface SessionExport {
  format: 'ai-whiteboard-session';
  version: 1;
  exportedAt: string;
  session: BoardSession;
  snapshots: SessionSnapshot[];
  events: SessionEvent[];
}

export interface WhiteboardApi {
  app: {
    info(): Promise<AppInfo>;
    quit(): Promise<void>;
  };
  window: {
    getMode(): Promise<WindowMode>;
    setMode(mode: WindowMode): Promise<WindowMode>;
    toggle(): Promise<boolean>;
    show(mode?: WindowMode): Promise<void>;
    hide(): Promise<void>;
    onModeChanged(listener: (mode: WindowMode) => void): () => void;
  };
  sessions: {
    list(): Promise<BoardSession[]>;
    get(id: string): Promise<BoardSession | null>;
    create(input?: { title?: string; document?: unknown }): Promise<BoardSession>;
    rename(id: string, title: string): Promise<BoardSession>;
    save(input: { id: string; document: unknown; metadata?: Record<string, unknown> }): Promise<BoardSession>;
    autosave(input: { id: string; document: unknown }): Promise<BoardSession>;
    remove(id: string): Promise<void>;
    export(id: string): Promise<{ canceled: boolean; path?: string }>;
    import(): Promise<{ canceled: boolean; session?: BoardSession }>;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: AppSettingsPatch): Promise<AppSettings>;
  };
  secrets: {
    has(provider: ProviderName): Promise<boolean>;
    set(provider: ProviderName, apiKey: string): Promise<void>;
    remove(provider: ProviderName): Promise<void>;
    configuredProviders(): Promise<ProviderName[]>;
  };
  clipboard: {
    read(): Promise<ClipboardPayload>;
    write(input: ClipboardWriteInput): Promise<void>;
  };
  dialogs: {
    save(options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; path?: string }>;
    open(options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<{ canceled: boolean; path?: string }>;
    saveFile(options: { name: string; data: string; mimeType: string }): Promise<{ canceled: boolean; path?: string }>;
    exportPdf(options: { name: string; svg: string }): Promise<{ canceled: boolean; path?: string }>;
  };
  ai: {
    start(input: AiRequestInput): Promise<{ requestId: string }>;
    cancel(requestId: string): Promise<boolean>;
    onEvent(listener: (event: NormalizedAiEvent) => void): () => void;
  };
}
