export type ViewMode = "quick" | "full" | "dock" | "inspect";

export type LensTab = "image" | "objects" | "timeline" | "selection";

export type CanvasSnapshot = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
};

export type SessionRecord = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  color: string;
  tags: string[];
  snapshot?: CanvasSnapshot;
};

export type HistoryEvent = {
  id: string;
  timestamp: string;
  label: string;
  kind: "draw" | "ai" | "session" | "export";
  detail?: string;
  snapshot?: CanvasSnapshot;
};

export type ContextSettings = {
  selection: boolean;
  image: boolean;
  objects: boolean;
  timeline: boolean;
};

export type AiEvent = {
  type?: "delta" | "text-delta" | "done" | "error" | "proposal" | "status";
  delta?: string;
  text?: string;
  message?: string;
  error?: string | { message?: string };
  proposal?: ProposedCanvasChange;
};

export type ProposedCanvasChange = {
  id: string;
  title: string;
  source: string;
  changes: Array<{ label: string; detail: string }>;
  status: "pending" | "accepted" | "rejected";
  nextSnapshot?: CanvasSnapshot;
};

export type AiSendRequest = {
  sessionId: string;
  prompt: string;
  context: unknown;
};

export type AiWhiteboardApi = {
  app?: {
    info?: () => Promise<{ version?: string; platform?: string } | undefined>;
    quit?: () => Promise<void>;
  };
  info?: () => Promise<{ version?: string; platform?: string } | undefined>;
  window?: {
    getMode?: () => Promise<ViewMode>;
    setMode?: (mode: ViewMode) => Promise<ViewMode | void>;
  };
  sessions?: {
    list?: () => Promise<Array<Partial<SessionRecord> & { id: string; title: string; createdAt: string; updatedAt: string; document?: unknown }>>;
    get?: (id: string) => Promise<(Partial<SessionRecord> & { id: string; title: string; createdAt: string; updatedAt: string; document?: unknown }) | null>;
    create?: (input?: { title?: string; document?: unknown } | Partial<SessionRecord>) => Promise<Partial<SessionRecord> & { id: string; title: string; createdAt: string; updatedAt: string }>;
    rename?: (id: string, title: string) => Promise<SessionRecord | void>;
    save?: (input: { id: string; document: unknown; metadata?: Record<string, unknown> }) => Promise<unknown>;
    autosave?: (input: { id: string; document: unknown }) => Promise<unknown>;
    remove?: (id: string) => Promise<void>;
    delete?: (id: string) => Promise<void>;
    load?: (id: string) => Promise<SessionRecord | CanvasSnapshot | undefined>;
    import?: () => Promise<{ canceled: boolean; session?: Partial<SessionRecord> & { id: string; title: string; createdAt: string; updatedAt: string; document?: unknown } }>;
    export?: (id: string, format?: string) => Promise<string | Uint8Array | { canceled: boolean; path?: string } | void>;
  };
  settings?: {
    get?: () => Promise<Record<string, unknown>>;
    update?: (settings: Record<string, unknown>) => Promise<Record<string, unknown>>;
    set?: (settings: Record<string, unknown>) => Promise<void>;
  };
  secrets?: {
    has?: (provider: string) => Promise<boolean>;
    remove?: (provider: string) => Promise<void>;
    status?: () => Promise<{ provider?: string; configured?: boolean }>;
    set?: (provider: string, value: string) => Promise<void>;
    clear?: (provider: string) => Promise<void>;
  };
  ai?: {
    start?: (request: {
      provider: string;
      model?: string;
      messages: Array<{
        role: string;
        content: string | Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string; alt?: string }>;
      }>;
      context?: unknown;
      sessionId?: string;
    }) => Promise<{ requestId: string }>;
    send?: (request: AiSendRequest) => Promise<unknown> | unknown;
    cancel?: (requestId?: string) => Promise<void> | void;
    onEvent?: (listener: (event: AiEvent) => void) => (() => void) | void;
  };
  clipboard?: {
    read?: () => Promise<{ text?: string; imageDataUrl?: string }>;
    write?: (value: { text?: string; imageDataUrl?: string }) => Promise<void>;
    writeText?: (value: string) => Promise<void>;
    readText?: () => Promise<string>;
  };
  dialogs?: {
    save?: (options?: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; path?: string }>;
    open?: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) => Promise<{ canceled: boolean; path?: string }>;
    saveFile?: (options: { name: string; data: string; mimeType: string }) => Promise<{ canceled: boolean; path?: string } | void>;
    exportPdf?: (options: { name: string; svg: string }) => Promise<{ canceled: boolean; path?: string } | void>;
    openFile?: () => Promise<string | undefined>;
  };
};
