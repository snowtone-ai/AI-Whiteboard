import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { safeStorage } from 'electron';

import {
  DEFAULT_GLOBAL_SHORTCUT,
  DEFAULT_MODELS,
  type AppSettings,
  type AppSettingsPatch,
  type AiRequestRecord,
  type BoardSession,
  type DatabaseState,
  type ProviderName,
  type SessionEvent,
  type SessionExport,
  type SessionSnapshot,
  type WindowMode,
} from './contracts';
import { assertJsonSerializable, MAX_DOCUMENT_BYTES } from './validation';

const DATABASE_VERSION = 1 as const;
const MAX_SESSION_SNAPSHOTS = 48;
const MAX_SESSION_EVENTS = 500;
const MAX_AI_REQUESTS = 500;

export function defaultSettings(): AppSettings {
  return {
    version: DATABASE_VERSION,
    windowMode: 'quick',
    globalShortcut: DEFAULT_GLOBAL_SHORTCUT,
    activeProvider: 'openai',
    models: { ...DEFAULT_MODELS },
    launchAtLogin: false,
    alwaysOnTop: true,
    autosaveIntervalMs: 2_000,
  };
}

export function emptyDatabase(): DatabaseState {
  return {
    version: DATABASE_VERSION,
    sessions: [],
    snapshots: [],
    events: [],
    aiRequests: [],
    settings: defaultSettings(),
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(value: unknown): boolean {
  try {
    return JSON.stringify(value) !== undefined;
  } catch {
    return false;
  }
}

function normalizeSettings(value: unknown): AppSettings {
  const defaults = defaultSettings();
  if (!isRecord(value)) return defaults;
  const models = isRecord(value.models) ? value.models : {};
  const provider = value.activeProvider;
  const mode = value.windowMode;
  return {
    ...defaults,
    version: DATABASE_VERSION,
    windowMode: isWindowMode(mode) ? mode : defaults.windowMode,
    globalShortcut:
      typeof value.globalShortcut === 'string' && value.globalShortcut.length <= 128
        ? value.globalShortcut
        : defaults.globalShortcut,
    activeProvider: isProvider(provider) ? provider : defaults.activeProvider,
    models: {
      openai: modelOrDefault(models.openai, defaults.models.openai),
      anthropic: modelOrDefault(models.anthropic, defaults.models.anthropic),
      google: modelOrDefault(models.google, defaults.models.google),
    },
    launchAtLogin: typeof value.launchAtLogin === 'boolean' ? value.launchAtLogin : defaults.launchAtLogin,
    alwaysOnTop: typeof value.alwaysOnTop === 'boolean' ? value.alwaysOnTop : defaults.alwaysOnTop,
    autosaveIntervalMs:
      typeof value.autosaveIntervalMs === 'number' &&
      Number.isInteger(value.autosaveIntervalMs) &&
      value.autosaveIntervalMs >= 500 &&
      value.autosaveIntervalMs <= 86_400_000
        ? value.autosaveIntervalMs
        : defaults.autosaveIntervalMs,
  };
}

function modelOrDefault(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 128 ? value : fallback;
}

function isWindowMode(value: unknown): value is WindowMode {
  return value === 'quick' || value === 'full' || value === 'dock' || value === 'inspect';
}

function isProvider(value: unknown): value is ProviderName {
  return value === 'openai' || value === 'anthropic' || value === 'google';
}

function normalizeState(value: unknown): DatabaseState {
  const fallback = emptyDatabase();
  if (!isRecord(value)) return fallback;

  // The first on-disk format is deliberately strict. Future migrations belong
  // here and can be tested without booting Electron.
  if (value.version !== DATABASE_VERSION) return fallback;

  const sessions = Array.isArray(value.sessions)
    ? value.sessions.filter((session): session is BoardSession => {
        if (!isRecord(session)) return false;
        return (
          typeof session.id === 'string' &&
          typeof session.title === 'string' &&
          typeof session.version === 'number' &&
          typeof session.createdAt === 'string' &&
          typeof session.updatedAt === 'string' &&
          isJsonValue(session.document)
        );
      })
    : [];

  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots.filter((snapshot): snapshot is SessionSnapshot => {
        if (!isRecord(snapshot)) return false;
        return (
          typeof snapshot.id === 'string' &&
          typeof snapshot.sessionId === 'string' &&
          typeof snapshot.version === 'number' &&
          typeof snapshot.createdAt === 'string' &&
          isJsonValue(snapshot.document)
        );
      })
    : [];

  const events = Array.isArray(value.events)
    ? value.events.filter((event): event is SessionEvent => {
        if (!isRecord(event)) return false;
        return (
          typeof event.id === 'string' &&
          typeof event.sessionId === 'string' &&
          typeof event.version === 'number' &&
          typeof event.type === 'string' &&
          typeof event.createdAt === 'string' &&
          isJsonValue(event.payload)
        );
      })
    : [];

  const aiRequests = Array.isArray(value.aiRequests)
    ? value.aiRequests.filter((request): request is AiRequestRecord => {
        if (!isRecord(request)) return false;
        return (
          typeof request.id === 'string' &&
          isProvider(request.provider) &&
          typeof request.model === 'string' &&
          typeof request.status === 'string' &&
          typeof request.createdAt === 'string'
        );
      })
    : [];

  return {
    version: DATABASE_VERSION,
    sessions,
    snapshots,
    events,
    aiRequests,
    settings: normalizeSettings(value.settings),
  };
}

function hasValidDatabaseShape(value: unknown): boolean {
  if (
    !isRecord(value) ||
    value.version !== DATABASE_VERSION ||
    !Array.isArray(value.sessions) ||
    !Array.isArray(value.snapshots) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.aiRequests) ||
    !isRecord(value.settings)
  ) {
    return false;
  }
  return (
    value.sessions.every((session) =>
      isRecord(session) &&
      typeof session.id === 'string' &&
      typeof session.title === 'string' &&
      typeof session.version === 'number' &&
      typeof session.createdAt === 'string' &&
      typeof session.updatedAt === 'string' &&
      isJsonValue(session.document),
    ) &&
    value.snapshots.every((snapshot) =>
      isRecord(snapshot) &&
      typeof snapshot.id === 'string' &&
      typeof snapshot.sessionId === 'string' &&
      typeof snapshot.version === 'number' &&
      typeof snapshot.createdAt === 'string' &&
      isJsonValue(snapshot.document),
    ) &&
    value.events.every((event) =>
      isRecord(event) &&
      typeof event.id === 'string' &&
      typeof event.sessionId === 'string' &&
      typeof event.version === 'number' &&
      typeof event.type === 'string' &&
      typeof event.createdAt === 'string' &&
      isJsonValue(event.payload),
    ) &&
    value.aiRequests.every((request) =>
      isRecord(request) &&
      typeof request.id === 'string' &&
      isProvider(request.provider) &&
      typeof request.model === 'string' &&
      typeof request.status === 'string' &&
      typeof request.createdAt === 'string',
    )
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath: string): Promise<unknown | undefined> {
  try {
    const value = await readFile(filePath, 'utf8');
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Write a JSON document using a fsync'd temporary file and a rename. The old
 * file is retained as a backup, allowing startup to recover from an interrupted
 * replacement or a partially written file.
 */
export async function atomicWriteJson(filePath: string, value: unknown, backupPath = `${filePath}.bak`): Promise<void> {
  const directory = dirname(filePath);
  await mkdir(directory, { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const encoded = JSON.stringify(value, null, 2);
  if (encoded === undefined || Buffer.byteLength(encoded, 'utf8') > MAX_DOCUMENT_BYTES * 4) {
    throw new Error('Document is too large to persist');
  }

  const handle = await open(temporaryPath, 'w');
  try {
    await handle.writeFile(encoded, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }

  const hadCurrent = await exists(filePath);
  try {
    if (hadCurrent) {
      // A backup is best effort: the current file remains the source of truth
      // if a filesystem does not permit replacing an existing backup.
      await rm(backupPath, { force: true });
      await rename(filePath, backupPath);
    }
    await rename(temporaryPath, filePath);
  } catch (error) {
    // Restore the previous valid file if the second rename fails.
    if (!(await exists(filePath)) && (await exists(backupPath))) {
      try {
        await rename(backupPath, filePath);
      } catch {
        // The next startup can still attempt backup recovery.
      }
    }
    throw error;
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export interface DatabasePaths {
  databasePath: string;
  backupPath?: string;
}

export class AtomicDatabase {
  private state: DatabaseState;
  private writeChain: Promise<void> = Promise.resolve();
  private closed = false;

  private constructor(private readonly paths: Required<DatabasePaths>, state: DatabaseState) {
    this.state = state;
  }

  static async open(paths: DatabasePaths): Promise<AtomicDatabase> {
    const resolved: Required<DatabasePaths> = {
      databasePath: paths.databasePath,
      backupPath: paths.backupPath ?? `${paths.databasePath}.bak`,
    };
    const primaryDocument = await readJson(resolved.databasePath);
    const primaryLooksValid = hasValidDatabaseShape(primaryDocument);
    let state = normalizeState(primaryDocument);
    if (!primaryLooksValid) {
      const backupDocument = await readJson(resolved.backupPath);
      const backupLooksValid = hasValidDatabaseShape(backupDocument);
      if (backupLooksValid) state = normalizeState(backupDocument);
    }
    const database = new AtomicDatabase(resolved, state);
    if (!primaryLooksValid) {
      // Preserve the last valid backup: atomicWriteJson would otherwise rotate
      // the corrupt primary over it before writing the recovered state.
      await rm(resolved.databasePath, { force: true });
      await database.flush();
    }
    return database;
  }

  get filePath(): string {
    return this.paths.databasePath;
  }

  async flush(): Promise<void> {
    if (this.closed) throw new Error('Database is closed');
    const snapshot = clone(this.state);
    const write = this.writeChain.catch(() => undefined).then(() =>
      atomicWriteJson(this.paths.databasePath, snapshot, this.paths.backupPath),
    );
    this.writeChain = write;
    await write;
  }

  async close(): Promise<void> {
    await this.writeChain;
    this.closed = true;
  }

  listSessions(): BoardSession[] {
    return clone([...this.state.sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  getSession(id: string): BoardSession | null {
    const session = this.state.sessions.find((candidate) => candidate.id === id);
    return session ? clone(session) : null;
  }

  async createSession(title = 'Untitled board', document: unknown = {}): Promise<BoardSession> {
    assertJsonSerializable(document, 'document');
    const now = new Date().toISOString();
    const session: BoardSession = {
      id: randomUUID(),
      title: title.trim() || 'Untitled board',
      version: 1,
      createdAt: now,
      updatedAt: now,
      document: clone(document),
    };
    this.state.sessions.push(session);
    this.state.snapshots.push({
      id: randomUUID(),
      sessionId: session.id,
      version: session.version,
      createdAt: now,
      document: clone(document),
    });
    this.state.events.push({
      id: randomUUID(),
      sessionId: session.id,
      version: session.version,
      type: 'session.created',
      createdAt: now,
      payload: { title: session.title },
    });
    await this.flush();
    return clone(session);
  }

  async renameSession(id: string, title: string): Promise<BoardSession> {
    const session = this.requireSession(id);
    const now = new Date().toISOString();
    session.title = title.trim() || session.title;
    session.version += 1;
    session.updatedAt = now;
    this.addEvent(session, 'session.renamed', { title: session.title });
    await this.flush();
    return clone(session);
  }

  async saveSession(id: string, document: unknown, metadata?: Record<string, unknown>): Promise<BoardSession> {
    assertJsonSerializable(document, 'document');
    if (metadata !== undefined) assertJsonSerializable(metadata, 'metadata');
    const session = this.requireSession(id);
    const now = new Date().toISOString();
    session.document = clone(document);
    if (metadata !== undefined) session.metadata = clone(metadata);
    session.version += 1;
    session.updatedAt = now;
    this.addSnapshot(session, now);
    this.addEvent(session, 'session.saved', { version: session.version });
    await this.flush();
    return clone(session);
  }

  async autosaveSession(id: string, document: unknown): Promise<BoardSession> {
    assertJsonSerializable(document, 'document');
    const session = this.requireSession(id);
    const now = new Date().toISOString();
    session.document = clone(document);
    session.version += 1;
    session.updatedAt = now;
    this.addSnapshot(session, now);
    this.addEvent(session, 'session.autosaved', { version: session.version });
    await this.flush();
    return clone(session);
  }

  async deleteSession(id: string): Promise<void> {
    this.requireSession(id);
    this.state.sessions = this.state.sessions.filter((session) => session.id !== id);
    this.state.snapshots = this.state.snapshots.filter((snapshot) => snapshot.sessionId !== id);
    this.state.events = this.state.events.filter((event) => event.sessionId !== id);
    this.state.aiRequests = this.state.aiRequests.filter((request) => request.sessionId !== id);
    await this.flush();
  }

  getSettings(): AppSettings {
    return clone(this.state.settings);
  }

  async updateSettings(patch: AppSettingsPatch): Promise<AppSettings> {
    const current = this.state.settings;
    const models = patch.models ? { ...current.models, ...patch.models } : current.models;
    this.state.settings = {
      ...current,
      ...patch,
      models,
      version: DATABASE_VERSION,
    };
    await this.flush();
    return clone(this.state.settings);
  }

  recordAiRequest(request: AiRequestRecord): void {
    this.state.aiRequests.push(clone(request));
    if (this.state.aiRequests.length > MAX_AI_REQUESTS) {
      this.state.aiRequests = this.state.aiRequests.slice(-MAX_AI_REQUESTS);
    }
    // The stream is persisted asynchronously by the caller so a UI request is
    // not blocked on disk I/O before the first token is delivered.
    void this.flush();
  }

  async finishAiRequest(id: string, patch: Pick<AiRequestRecord, 'status'> & Partial<AiRequestRecord>): Promise<void> {
    const request = this.state.aiRequests.find((candidate) => candidate.id === id);
    if (!request) return;
    Object.assign(request, clone(patch));
    await this.flush();
  }

  exportSession(id: string): SessionExport {
    const session = this.requireSession(id);
    return {
      format: 'ai-whiteboard-session',
      version: 1,
      exportedAt: new Date().toISOString(),
      session: clone(session),
      snapshots: clone(this.state.snapshots.filter((snapshot) => snapshot.sessionId === id)),
      events: clone(this.state.events.filter((event) => event.sessionId === id)),
    };
  }

  async importSession(value: unknown): Promise<BoardSession> {
    if (!isRecord(value) || value.format !== 'ai-whiteboard-session' || value.version !== 1 || !isRecord(value.session)) {
      throw new Error('Unsupported session export');
    }
    let encoded: string;
    try {
      encoded = JSON.stringify(value);
    } catch {
      throw new Error('Invalid session export');
    }
    if (Buffer.byteLength(encoded, 'utf8') > MAX_DOCUMENT_BYTES * 4) throw new Error('Session export is too large');
    const source = value.session;
    if (
      typeof source.title !== 'string' ||
      source.title.length > 200 ||
      !isJsonValue(source.document) ||
      Buffer.byteLength(JSON.stringify(source.document), 'utf8') > MAX_DOCUMENT_BYTES
    ) {
      throw new Error('Invalid session export');
    }
    const sourceSnapshots = Array.isArray(value.snapshots) ? value.snapshots : [];
    const sourceEvents = Array.isArray(value.events) ? value.events : [];
    if (
      !sourceSnapshots.every((snapshot) =>
        isRecord(snapshot) &&
        typeof snapshot.version === 'number' &&
        Number.isInteger(snapshot.version) &&
        snapshot.version > 0 &&
        typeof snapshot.createdAt === 'string' &&
        isJsonValue(snapshot.document),
      ) ||
      !sourceEvents.every((event) =>
        isRecord(event) &&
        typeof event.version === 'number' &&
        Number.isInteger(event.version) &&
        event.version > 0 &&
        typeof event.type === 'string' &&
        event.type.length > 0 &&
        typeof event.createdAt === 'string' &&
        isJsonValue(event.payload),
      )
    ) {
      throw new Error('Invalid session history');
    }
    const now = new Date().toISOString();
    const session: BoardSession = {
      id: randomUUID(),
      title: source.title.trim() || 'Imported board',
      version: typeof source.version === 'number' && Number.isInteger(source.version) && source.version > 0 ? source.version : 1,
      createdAt: now,
      updatedAt: now,
      document: clone(source.document),
      metadata: isRecord(source.metadata) ? clone(source.metadata) : undefined,
    };
    this.state.sessions.push(session);
    const importedSnapshots = sourceSnapshots.slice(-MAX_SESSION_SNAPSHOTS).map((snapshot) => {
      const item = snapshot as Record<string, unknown>;
      return {
        id: randomUUID(),
        sessionId: session.id,
        version: item.version as number,
        createdAt: item.createdAt as string,
        document: clone(item.document),
      } satisfies SessionSnapshot;
    });
    this.state.snapshots.push(...(importedSnapshots.length > 0 ? importedSnapshots : [{
      id: randomUUID(),
      sessionId: session.id,
      version: session.version,
      createdAt: now,
      document: clone(session.document),
    }]));
    this.state.events.push(...sourceEvents.slice(-MAX_SESSION_EVENTS + 1).map((event) => {
      const item = event as Record<string, unknown>;
      return {
        id: randomUUID(),
        sessionId: session.id,
        version: item.version as number,
        type: item.type as string,
        createdAt: item.createdAt as string,
        payload: clone(item.payload),
      } satisfies SessionEvent;
    }));
    this.addEvent(session, 'session.imported', { sourceTitle: session.title });
    await this.flush();
    return clone(session);
  }

  private requireSession(id: string): BoardSession {
    const session = this.state.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error('Session not found');
    return session;
  }

  private addSnapshot(session: BoardSession, createdAt: string): void {
    this.state.snapshots.push({
      id: randomUUID(),
      sessionId: session.id,
      version: session.version,
      createdAt,
      document: clone(session.document),
    });
    const sessionSnapshots = this.state.snapshots.filter((snapshot) => snapshot.sessionId === session.id);
    if (sessionSnapshots.length > MAX_SESSION_SNAPSHOTS) {
      const keep = new Set(sessionSnapshots.slice(-MAX_SESSION_SNAPSHOTS).map((snapshot) => snapshot.id));
      this.state.snapshots = this.state.snapshots.filter(
        (snapshot) => snapshot.sessionId !== session.id || keep.has(snapshot.id),
      );
    }
  }

  private addEvent(session: BoardSession, type: string, payload: unknown): void {
    this.state.events.push({
      id: randomUUID(),
      sessionId: session.id,
      version: session.version,
      type,
      createdAt: new Date().toISOString(),
      payload: clone(payload),
    });
    const sessionEvents = this.state.events.filter((event) => event.sessionId === session.id);
    if (sessionEvents.length > MAX_SESSION_EVENTS) {
      const keep = new Set(sessionEvents.slice(-MAX_SESSION_EVENTS).map((event) => event.id));
      this.state.events = this.state.events.filter((event) => event.sessionId !== session.id || keep.has(event.id));
    }
  }
}

export interface SecretStorePaths {
  secretsPath: string;
  backupPath?: string;
}

/**
 * API keys never enter the JSON database. safeStorage is required; there is no
 * plaintext fallback because that would make a stolen profile sufficient to
 * recover provider credentials.
 */
export class EncryptedSecretsStore {
  private values: Record<string, string> = {};
  private writeChain: Promise<void> = Promise.resolve();
  private readonly backupPath: string;

  private constructor(private readonly secretsPath: string, backupPath?: string) {
    this.backupPath = backupPath ?? `${secretsPath}.bak`;
  }

  static async open(paths: SecretStorePaths): Promise<EncryptedSecretsStore> {
    const store = new EncryptedSecretsStore(paths.secretsPath, paths.backupPath);
    const loaded = await readJson(paths.secretsPath);
    const fallback = await readJson(paths.backupPath ?? `${paths.secretsPath}.bak`);
    const candidate = isRecord(loaded) ? loaded : isRecord(fallback) ? fallback : {};
    for (const [provider, encrypted] of Object.entries(candidate)) {
      if (isProvider(provider) && typeof encrypted === 'string' && encrypted.length > 0) {
        store.values[provider] = encrypted;
      }
    }
    return store;
  }

  private requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('ENCRYPTION_UNAVAILABLE: secure key storage is unavailable on this device');
    }
  }

  async set(provider: ProviderName, apiKey: string): Promise<void> {
    this.requireEncryption();
    const encrypted = safeStorage.encryptString(apiKey).toString('base64');
    this.values[provider] = encrypted;
    await this.flush();
  }

  get(provider: ProviderName): string | undefined {
    const encrypted = this.values[provider];
    if (!encrypted) return undefined;
    this.requireEncryption();
    try {
      return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
    } catch {
      throw new Error('SECRET_DECRYPT_FAILED: stored provider key could not be decrypted');
    }
  }

  has(provider: ProviderName): boolean {
    return Boolean(this.values[provider]);
  }

  async remove(provider: ProviderName): Promise<void> {
    delete this.values[provider];
    await this.flush();
  }

  configuredProviders(): ProviderName[] {
    return (['openai', 'anthropic', 'google'] as const).filter((provider) => this.has(provider));
  }

  async close(): Promise<void> {
    await this.writeChain;
  }

  private async flush(): Promise<void> {
    const snapshot = clone(this.values);
    const write = this.writeChain.catch(() => undefined).then(() =>
      atomicWriteJson(this.secretsPath, snapshot, this.backupPath),
    );
    this.writeChain = write;
    await write;
  }
}

export function defaultStoragePaths(userDataPath: string): { databasePath: string; secretsPath: string } {
  const directory = join(userDataPath, 'whiteboard');
  return {
    databasePath: join(directory, 'database.json'),
    secretsPath: join(directory, 'secrets.json'),
  };
}
