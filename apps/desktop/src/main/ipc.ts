import { randomUUID } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';

import {
  DEFAULT_MODELS,
  IPC_CHANNELS,
  type AiRequestInput,
  type AiRequestRecord,
  type NormalizedAiEvent,
  type ProviderName,
  type SafeError,
} from './contracts';
import { AtomicDatabase, EncryptedSecretsStore, atomicWriteJson } from './storage';
import { isAbortError, ProviderManager, redactError } from './providers';
import { WindowManager } from './window';
import {
  aiCancelSchema,
  aiRequestSchema,
  autosaveSessionSchema,
  clipboardWriteSchema,
  createSessionSchema,
  parseIpcPayload,
  renameSessionSchema,
  saveSessionSchema,
  secretProviderSchema,
  setSecretSchema,
  setWindowModeSchema,
  sessionIdSchema,
  updateSettingsSchema,
  isSafePrintableSvg,
  MAX_SESSION_IMPORT_BYTES,
} from './validation';

const undefinedSchema = z.undefined();
const dialogOptionsSchema = z
  .object({
    defaultPath: z.string().max(1_000).optional(),
    filters: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          extensions: z.array(z.string().trim().regex(/^[a-zA-Z0-9*_-]+$/)).min(1).max(20),
        }),
      )
      .max(10)
      .optional(),
  })
  .optional();

const saveFileSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => basename(value) === value, 'File name must not contain a path'),
  data: z.string().max(40_000_000),
  mimeType: z.enum(['application/json', 'image/svg+xml', 'text/markdown', 'text/plain']),
});
const exportPdfSchema = z.object({
  name: z.string().trim().min(1).max(255).refine((value) => basename(value) === value, 'File name must not contain a path'),
  svg: z.string().min(1).max(40_000_000).refine(isSafePrintableSvg, 'SVG contains active or external content'),
});

export interface IpcDependencies {
  database: AtomicDatabase;
  secrets: EncryptedSecretsStore;
  providers: ProviderManager;
  windows: WindowManager;
}

function ipcError(error: unknown, provider?: ProviderName): Error {
  const safe = redactError(error, provider);
  const result = new Error(safe.message);
  const requestedCode = error && typeof error === 'object' ? (error as Record<string, unknown>).code : undefined;
  result.name = typeof requestedCode === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(requestedCode) ? requestedCode : safe.code;
  return result;
}

function sendToRenderer(windows: WindowManager, channel: string, value: unknown): void {
  const target = windows.getMainWindow();
  if (!target || target.isDestroyed() || target.webContents.isDestroyed()) return;
  target.webContents.send(channel, value);
}

function assertTrustedSender(windows: WindowManager, event: IpcMainInvokeEvent): void {
  if (!windows.isTrustedSender(event)) throw ipcError(Object.assign(new Error('Untrusted IPC sender'), { code: 'FORBIDDEN' }));
}

function buildFilters(filters: Array<{ name: string; extensions: string[] }> | undefined): Electron.FileFilter[] {
  return filters?.map((filter) => ({ name: filter.name, extensions: filter.extensions })) ?? [
    { name: 'AI Whiteboard session', extensions: ['whiteboard', 'json'] },
  ];
}

export class IpcController {
  private readonly abortControllers = new Map<string, AbortController>();
  private disposed = false;

  constructor(private readonly dependencies: IpcDependencies) {}

  register(): void {
    const { database, secrets, providers, windows } = this.dependencies;
    const handle = <TInput, TOutput>(
      channel: string,
      schema: z.ZodType<TInput>,
      callback: (event: IpcMainInvokeEvent, input: TInput) => Promise<TOutput> | TOutput,
    ): void => {
      ipcMain.handle(channel, async (event, payload: unknown) => {
        assertTrustedSender(windows, event);
        let input: TInput;
        try {
          input = parseIpcPayload(schema, payload);
        } catch (error) {
          throw ipcError(Object.assign(new Error(error instanceof Error ? error.message : 'Invalid request'), { code: 'INVALID_REQUEST' }));
        }
        try {
          return await callback(event, input);
        } catch (error) {
          const provider = channel === IPC_CHANNELS.aiStart ? (input as Partial<AiRequestInput>).provider : undefined;
          throw ipcError(error, provider);
        }
      });
    };

    handle(IPC_CHANNELS.appInfo, undefinedSchema, async () => ({
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      isPackaged: app.isPackaged,
    }));
    handle(IPC_CHANNELS.appQuit, undefinedSchema, async () => {
      app.quit();
    });

    handle(IPC_CHANNELS.windowGetMode, undefinedSchema, () => windows.getMode());
    handle(IPC_CHANNELS.windowSetMode, setWindowModeSchema, async (_event, input) => windows.setMode(input.mode));
    handle(IPC_CHANNELS.windowToggle, undefinedSchema, () => windows.toggle());
    handle(IPC_CHANNELS.windowShow, z.object({ mode: setWindowModeSchema.shape.mode.optional() }).optional(), async (_event, input) => {
      await windows.show(input?.mode);
    });
    handle(IPC_CHANNELS.windowHide, undefinedSchema, () => windows.hide());

    handle(IPC_CHANNELS.sessionsList, undefinedSchema, () => database.listSessions());
    handle(IPC_CHANNELS.sessionsGet, sessionIdSchema, (_event, input) => database.getSession(input.id));
    handle(IPC_CHANNELS.sessionsCreate, createSessionSchema.optional(), async (_event, input) =>
      database.createSession(input?.title, input?.document),
    );
    handle(IPC_CHANNELS.sessionsRename, renameSessionSchema, (_event, input) => database.renameSession(input.id, input.title));
    handle(IPC_CHANNELS.sessionsSave, saveSessionSchema, (_event, input) => database.saveSession(input.id, input.document, input.metadata));
    handle(IPC_CHANNELS.sessionsAutosave, autosaveSessionSchema, (_event, input) => database.autosaveSession(input.id, input.document));
    handle(IPC_CHANNELS.sessionsDelete, sessionIdSchema, (_event, input) => database.deleteSession(input.id));

    handle(IPC_CHANNELS.sessionsExport, sessionIdSchema, async (_event, input) => {
      const target = windows.getMainWindow();
      const options = {
        title: 'Export whiteboard session',
        defaultPath: 'whiteboard-session.whiteboard',
        filters: [{ name: 'AI Whiteboard session', extensions: ['whiteboard', 'json'] }],
      };
      const result = target ? await dialog.showSaveDialog(target, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { canceled: true };
      await atomicWriteJson(result.filePath, database.exportSession(input.id), `${result.filePath}.bak`);
      return { canceled: false, path: result.filePath };
    });
    handle(IPC_CHANNELS.sessionsImport, undefinedSchema, async () => {
      const target = windows.getMainWindow();
      const options = {
        title: 'Import whiteboard session',
        properties: ['openFile'] as Array<'openFile'>,
        filters: [{ name: 'AI Whiteboard session', extensions: ['whiteboard', 'json'] }],
      };
      const result = target ? await dialog.showOpenDialog(target, options) : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return { canceled: true };
      const fileInfo = await stat(result.filePaths[0]);
      if (!fileInfo.isFile() || fileInfo.size > MAX_SESSION_IMPORT_BYTES) {
        throw Object.assign(new Error('Session file is too large'), { code: 'IMPORT_TOO_LARGE' });
      }
      const encoded = await readFile(result.filePaths[0], 'utf8');
      const session = await database.importSession(JSON.parse(encoded) as unknown);
      return { canceled: false, session };
    });

    handle(IPC_CHANNELS.settingsGet, undefinedSchema, () => database.getSettings());
    handle(IPC_CHANNELS.settingsUpdate, updateSettingsSchema, async (_event, input) => {
      const before = database.getSettings();
      const next = await database.updateSettings(input);
      if (input.windowMode) await windows.setMode(input.windowMode, false);
      if (input.alwaysOnTop !== undefined) windows.setAlwaysOnTop(input.alwaysOnTop);
      if (input.globalShortcut && input.globalShortcut !== before.globalShortcut) {
        const registered = await windows.setGlobalShortcut(input.globalShortcut);
        if (!registered) {
          await database.updateSettings({ globalShortcut: before.globalShortcut });
          throw Object.assign(new Error('Global shortcut is already in use'), { code: 'SHORTCUT_UNAVAILABLE' });
        }
      }
      return next;
    });

    handle(IPC_CHANNELS.secretHas, secretProviderSchema, (_event, input) => secrets.has(input.provider));
    handle(IPC_CHANNELS.secretSet, setSecretSchema, (_event, input) => secrets.set(input.provider, input.apiKey));
    handle(IPC_CHANNELS.secretDelete, secretProviderSchema, (_event, input) => secrets.remove(input.provider));
    handle(IPC_CHANNELS.secretProviders, undefinedSchema, () => secrets.configuredProviders());

    handle(IPC_CHANNELS.clipboardRead, undefinedSchema, () => {
      const image = clipboard.readImage();
      const png = image.isEmpty() ? undefined : image.toPNG();
      return {
        text: clipboard.readText(),
        imageDataUrl: png && png.length <= 20_000_000 ? `data:image/png;base64,${png.toString('base64')}` : undefined,
      };
    });
    handle(IPC_CHANNELS.clipboardWrite, clipboardWriteSchema, (_event, input) => {
      const image = input.imageDataUrl ? nativeImage.createFromDataURL(input.imageDataUrl) : undefined;
      if (image && image.isEmpty()) throw Object.assign(new Error('Invalid image data'), { code: 'INVALID_IMAGE' });
      clipboard.write({ text: input.text ?? '', image });
    });

    handle(IPC_CHANNELS.dialogSave, dialogOptionsSchema, async (_event, input) => {
      const target = windows.getMainWindow();
      const options = {
        defaultPath: input?.defaultPath,
        filters: buildFilters(input?.filters),
      };
      const result = target ? await dialog.showSaveDialog(target, options) : await dialog.showSaveDialog(options);
      return result.canceled || !result.filePath
        ? { canceled: true }
        : { canceled: false, path: result.filePath };
    });
    handle(IPC_CHANNELS.dialogSaveFile, saveFileSchema, async (_event, input) => {
      const extension = extname(input.name).slice(1) || 'txt';
      const target = windows.getMainWindow();
      const options = {
        defaultPath: input.name,
        filters: [{ name: input.mimeType, extensions: [extension] }],
      };
      const result = target ? await dialog.showSaveDialog(target, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { canceled: true };
      await writeFile(result.filePath, input.data, 'utf8');
      return { canceled: false, path: result.filePath };
    });
    handle(IPC_CHANNELS.dialogExportPdf, exportPdfSchema, async (_event, input) => {
      const target = windows.getMainWindow();
      const result = target
        ? await dialog.showSaveDialog(target, { defaultPath: input.name, filters: [{ name: 'PDF document', extensions: ['pdf'] }] })
        : await dialog.showSaveDialog({ defaultPath: input.name, filters: [{ name: 'PDF document', extensions: ['pdf'] }] });
      if (result.canceled || !result.filePath) return { canceled: true };

      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      try {
        const document = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:"><style>@page{size:A4 landscape;margin:8mm}html,body{margin:0;width:100%;height:100%;display:grid;place-items:center;background:white}svg{max-width:100%;max-height:100%;width:auto;height:auto}</style></head><body>${input.svg}</body></html>`;
        await printWindow.loadURL(`data:text/html;base64,${Buffer.from(document, 'utf8').toString('base64')}`);
        const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', landscape: true });
        await writeFile(result.filePath, pdf);
        return { canceled: false, path: result.filePath };
      } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
      }
    });
    handle(IPC_CHANNELS.dialogOpen, dialogOptionsSchema, async (_event, input) => {
      const target = windows.getMainWindow();
      const options = {
        properties: ['openFile'] as Array<'openFile'>,
        filters: buildFilters(input?.filters),
      };
      const result = target ? await dialog.showOpenDialog(target, options) : await dialog.showOpenDialog(options);
      return result.canceled || result.filePaths.length === 0
        ? { canceled: true }
        : { canceled: false, path: result.filePaths[0] };
    });

    handle(IPC_CHANNELS.aiStart, aiRequestSchema, (_event, input) => this.startAi(input, database, providers, windows));
    handle(IPC_CHANNELS.aiCancel, aiCancelSchema, (_event, input) => this.cancelAi(input.requestId));
  }

  async shutdown(): Promise<void> {
    this.disposed = true;
    for (const controller of this.abortControllers.values()) controller.abort();
    this.abortControllers.clear();
  }

  private startAi(
    input: AiRequestInput,
    database: AtomicDatabase,
    providers: ProviderManager,
    windows: WindowManager,
  ): { requestId: string } {
    if (this.disposed) throw Object.assign(new Error('Application is shutting down'), { code: 'SHUTTING_DOWN' });
    const requestId = randomUUID();
    const settings = database.getSettings();
    const model = input.model ?? settings.models[input.provider] ?? DEFAULT_MODELS[input.provider];
    const request: AiRequestInput = { ...input, model };
    const record: AiRequestRecord = {
      id: requestId,
      sessionId: input.sessionId,
      provider: input.provider,
      model,
      status: 'running',
      createdAt: new Date().toISOString(),
    };
    const controller = new AbortController();
    this.abortControllers.set(requestId, controller);
    database.recordAiRequest(record);
    void this.consumeAi(request, requestId, controller, database, providers, windows);
    return { requestId };
  }

  private async consumeAi(
    request: AiRequestInput,
    requestId: string,
    controller: AbortController,
    database: AtomicDatabase,
    providers: ProviderManager,
    windows: WindowManager,
  ): Promise<void> {
    let usage: AiRequestRecord['usage'];
    let completed = false;
    try {
      for await (const event of providers.stream(request, requestId, controller.signal)) {
        if (event.type === 'usage') usage = event.usage;
        if (event.type === 'done') completed = true;
        sendToRenderer(windows, IPC_CHANNELS.aiEvent, event);
      }
      if (controller.signal.aborted) {
        const done: NormalizedAiEvent = { type: 'done', requestId, provider: request.provider, stopReason: 'cancelled' };
        sendToRenderer(windows, IPC_CHANNELS.aiEvent, done);
        await database.finishAiRequest(requestId, { status: 'cancelled', completedAt: new Date().toISOString(), usage });
      } else {
        if (!completed) {
          const done: NormalizedAiEvent = { type: 'done', requestId, provider: request.provider, stopReason: 'completed' };
          sendToRenderer(windows, IPC_CHANNELS.aiEvent, done);
        }
        await database.finishAiRequest(requestId, { status: 'completed', completedAt: new Date().toISOString(), usage });
      }
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) {
        const done: NormalizedAiEvent = { type: 'done', requestId, provider: request.provider, stopReason: 'cancelled' };
        sendToRenderer(windows, IPC_CHANNELS.aiEvent, done);
        await database.finishAiRequest(requestId, { status: 'cancelled', completedAt: new Date().toISOString(), usage });
      } else {
        const safeError: SafeError = redactError(error, request.provider);
        const event: NormalizedAiEvent = { type: 'error', requestId, provider: request.provider, error: safeError };
        sendToRenderer(windows, IPC_CHANNELS.aiEvent, event);
        await database.finishAiRequest(requestId, {
          status: 'error',
          completedAt: new Date().toISOString(),
          usage,
          error: safeError,
        });
      }
    } finally {
      this.abortControllers.delete(requestId);
    }
  }

  private cancelAi(requestId: string): boolean {
    const controller = this.abortControllers.get(requestId);
    if (!controller) return false;
    controller.abort();
    return true;
  }
}
