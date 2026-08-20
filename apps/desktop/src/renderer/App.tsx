import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Excalidraw,
  exportToBlob,
  exportToSvg,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import {
  applyPrivacySwitches,
  buildAWCPRequest,
  buildPromptContract,
  diffSnapshots,
  exportContextCapsule,
  extractSemantics,
  promptContractText,
} from "@ai-whiteboard/core";
import {
  Archive,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  FileJson,
  FileText,
  FolderOpen,
  Grid2X2,
  History,
  Image as ImageIcon,
  Info,
  Keyboard,
  Layers3,
  Loader2,
  LockKeyhole,
  Maximize2,
  Mic,
  Moon,
  MoreHorizontal,
  PanelLeft,
  PanelRight,
  Pause,
  PenLine,
  Plus,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Send,
  Settings2,
  Share2,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import type {
  CanvasSnapshot,
  ContextSettings,
  HistoryEvent,
  LensTab,
  ProposedCanvasChange,
  SessionRecord,
  ViewMode,
} from "./types";
import "./styles.css";

type ExportFormat = "png" | "svg" | "pdf" | "markdown" | "json" | "capsule" | "session";

type Theme = "light" | "dark";
type DialogType = "onboarding" | "settings" | "shortcuts" | "export" | null;
type ProviderId = "openai" | "anthropic" | "google";

const providerOptions: Array<{ id: ProviderId; label: string; models: string[] }> = [
  { id: "openai", label: "OpenAI", models: ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] },
  { id: "anthropic", label: "Anthropic", models: ["claude-sonnet-5"] },
  { id: "google", label: "Google Gemini", models: ["gemini-3.7-flash"] },
];

function providerModel(provider: ProviderId) {
  return providerOptions.find((option) => option.id === provider)?.models[0] ?? "gpt-5.6-luna";
}

function isProviderId(value: unknown): value is ProviderId {
  return value === "openai" || value === "anthropic" || value === "google";
}

type AiReply = {
  text: string;
  status: "idle" | "streaming" | "done" | "error";
  error?: string;
};

type ExcalidrawApi = {
  updateScene?: (scene: { elements?: unknown[]; appState?: Record<string, unknown>; files?: Record<string, unknown> }) => void;
  getAppState?: () => Record<string, unknown>;
  getSceneElements?: () => unknown[];
  getFiles?: () => Record<string, unknown>;
  scrollToContent?: (target?: unknown, options?: unknown) => void;
  toggleSidebar?: (options: { name: string }) => void;
};

const THEME_STORAGE_KEY = "ai-whiteboard:theme";
const MODE_STORAGE_KEY = "ai-whiteboard:view-mode";
const CONTEXT_STORAGE_KEY = "ai-whiteboard:context";

const sessionColors = ["blue", "coral", "ink", "ochre"];

const starterSessions: SessionRecord[] = [
  {
    id: "session-friction",
    title: "摩擦の実験｜中2 STEM",
    createdAt: "2026-08-20T08:50:00.000Z",
    updatedAt: "2026-08-20T11:42:00.000Z",
    color: "blue",
    tags: ["授業", "物理"],
  },
  {
    id: "session-review",
    title: "設計レビュー｜ローカル同期",
    createdAt: "2026-08-19T18:22:00.000Z",
    updatedAt: "2026-08-19T20:16:00.000Z",
    color: "coral",
    tags: ["開発", "レビュー"],
  },
  {
    id: "session-study",
    title: "分数を図で考える",
    createdAt: "2026-08-18T06:25:00.000Z",
    updatedAt: "2026-08-18T07:18:00.000Z",
    color: "ochre",
    tags: ["家庭学習"],
  },
];

const starterHistory: HistoryEvent[] = [
  {
    id: "history-1",
    timestamp: "11:42",
    label: "キャンバスを自動保存",
    detail: "12 objects · local",
    kind: "session",
  },
  {
    id: "history-2",
    timestamp: "11:38",
    label: "AIの要約を受け取り",
    detail: "摩擦係数の比較",
    kind: "ai",
  },
  {
    id: "history-3",
    timestamp: "11:31",
    label: "図形を3つ追加",
    detail: "selection 3 objects",
    kind: "draw",
  },
  {
    id: "history-4",
    timestamp: "11:16",
    label: "セッションを開いた",
    detail: "摩擦の実験｜中2 STEM",
    kind: "session",
  },
];

const defaultContext: ContextSettings = {
  selection: true,
  image: true,
  objects: true,
  timeline: false,
};

const defaultAppState: Record<string, unknown> = {
  viewBackgroundColor: "#F7F8F4",
  theme: "light",
  zenModeEnabled: false,
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => readStorage(key, fallback));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The canvas remains usable when localStorage is unavailable.
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "たった今";
  const today = new Date();
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
}

function mergeSnapshot(snapshot?: CanvasSnapshot): CanvasSnapshot {
  const mergedAppState = { ...defaultAppState, ...(snapshot?.appState ?? {}) };
  // Excalidraw keeps collaborators in a Map. JSON persistence serializes an
  // empty Map as {}, which crashes the canvas when replayed as app state.
  if ("collaborators" in mergedAppState && !(mergedAppState.collaborators instanceof Map)) {
    delete mergedAppState.collaborators;
  }
  return {
    elements: Array.isArray(snapshot?.elements) ? snapshot.elements : [],
    appState: mergedAppState,
    files: snapshot?.files ?? {},
  };
}

export function toPersistedSnapshot(snapshot: CanvasSnapshot): CanvasSnapshot {
  const encoded = JSON.stringify(snapshot, (key, value: unknown) => {
    if (key === "collaborators") return undefined;
    if (value instanceof Map) return Object.fromEntries(value);
    if (value instanceof Set) return [...value];
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  });
  return mergeSnapshot(encoded ? JSON.parse(encoded) as CanvasSnapshot : undefined);
}

export function scopeCanvasElements(elements: unknown[], selectedIds: string[], selectedOnly: boolean): unknown[] {
  if (!selectedOnly) return elements;
  if (selectedIds.length === 0) return [];
  const selection = new Set(selectedIds);
  return elements.filter((element) => selection.has(String((element as { id?: unknown }).id ?? "")));
}

function normalizeRemoteSession(session: Partial<SessionRecord> & { id: string; title: string; createdAt: string; updatedAt: string; document?: unknown }, index = 0): SessionRecord {
  const documentSnapshot = session.document && typeof session.document === "object" ? session.document as Partial<CanvasSnapshot> : undefined;
  return {
    id: session.id,
    title: session.title,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    color: session.color ?? sessionColors[index % sessionColors.length],
    tags: session.tags ?? [],
    snapshot: session.snapshot ?? (documentSnapshot && Array.isArray(documentSnapshot.elements) ? mergeSnapshot(documentSnapshot as CanvasSnapshot) : undefined),
  };
}

function toCoreSnapshot(snapshot: CanvasSnapshot) {
  const selectedElementIds = snapshot.appState?.selectedElementIds;
  const rawZoom = snapshot.appState?.zoom;
  const rawActiveTool = snapshot.appState?.activeTool;
  const normalizePoint = (point: unknown) => {
    if (Array.isArray(point) && typeof point[0] === "number" && typeof point[1] === "number") {
      return { x: point[0], y: point[1] };
    }
    return point;
  };
  const normalizedElements = snapshot.elements.map((element) => {
    if (!element || typeof element !== "object") return element;
    const normalized = { ...(element as Record<string, unknown>) };
    if (Array.isArray(normalized.points)) normalized.points = normalized.points.map(normalizePoint);
    if (normalized.lastCommittedPoint !== undefined) normalized.lastCommittedPoint = normalizePoint(normalized.lastCommittedPoint);
    if (normalized.link === null) delete normalized.link;
    return normalized;
  });
  const normalizedFiles = Object.fromEntries(Object.entries(snapshot.files ?? {}).map(([id, file]) => [
    id,
    file && typeof file === "object" ? { id, ...(file as Record<string, unknown>) } : file,
  ]));
  return {
    version: 1,
    elements: normalizedElements,
    appState: {
      viewBackgroundColor: typeof snapshot.appState?.viewBackgroundColor === "string" ? snapshot.appState.viewBackgroundColor : undefined,
      scrollX: typeof snapshot.appState?.scrollX === "number" ? snapshot.appState.scrollX : undefined,
      scrollY: typeof snapshot.appState?.scrollY === "number" ? snapshot.appState.scrollY : undefined,
      zoom: typeof rawZoom === "number"
        ? rawZoom
        : rawZoom && typeof rawZoom === "object" && typeof (rawZoom as { value?: unknown }).value === "number"
          ? (rawZoom as { value: number }).value
          : undefined,
      activeTool: typeof rawActiveTool === "string"
        ? rawActiveTool
        : rawActiveTool && typeof rawActiveTool === "object" && typeof (rawActiveTool as { type?: unknown }).type === "string"
          ? (rawActiveTool as { type: string }).type
          : undefined,
      selectedElementIds: Array.isArray(selectedElementIds) ? selectedElementIds : selectedElementIds && typeof selectedElementIds === "object" ? Object.keys(selectedElementIds) : [],
    },
    files: normalizedFiles,
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み取れませんでした。"));
    reader.readAsDataURL(blob);
  });
}

function IconButton({
  label,
  active,
  tone,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  tone?: "blue" | "coral" | "quiet";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${active ? "is-active" : ""} ${tone ? `tone-${tone}` : ""} ${className}`}
      aria-label={label}
      data-tooltip={label}
      {...props}
    >
      {children}
    </button>
  );
}

function App() {
  const [sessions, setSessions] = useState<SessionRecord[]>(starterSessions);
  const [theme, setTheme] = useStoredState<Theme>(THEME_STORAGE_KEY, "light");
  const [viewMode, setViewMode] = useStoredState<ViewMode>(MODE_STORAGE_KEY, "full");
  const [contextSettings, setContextSettings] = useStoredState<ContextSettings>(CONTEXT_STORAGE_KEY, defaultContext);
  const [activeSessionId, setActiveSessionId] = useStoredState<string>("ai-whiteboard:active-session", starterSessions[0].id);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [sessionQuery, setSessionQuery] = useState("");
  const [sessionBrowserOpen, setSessionBrowserOpen] = useState(true);
  const [lensOpen, setLensOpen] = useState(true);
  const [lensTab, setLensTab] = useState<LensTab>("objects");
  const [dialog, setDialog] = useState<DialogType>(null);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<HistoryEvent[]>(starterHistory);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [elements, setElements] = useState<unknown[]>([]);
  const [appState, setAppState] = useState<Record<string, unknown>>(defaultAppState);
  const [files, setFiles] = useState<Record<string, unknown>>({});
  const [lastSaved, setLastSaved] = useState(new Date());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "offline" | "error">("saved");
  const [aiReply, setAiReply] = useState<AiReply>({ text: "", status: "idle" });
  const [conversation, setConversation] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "unsupported" | "error">("idle");
  const [proposal, setProposal] = useState<ProposedCanvasChange | null>(null);
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [model, setModel] = useState("gpt-5.6-luna");
  const [apiKeyStatus, setApiKeyStatus] = useState<"connected" | "not-configured" | "checking">("checking");
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [replayMode, setReplayMode] = useState(false);

  const excalidrawApiRef = useRef<ExcalidrawApi | null>(null);
  const sceneRef = useRef<CanvasSnapshot>({ elements: [], appState: defaultAppState, files: {} });
  const replayBaseRef = useRef<CanvasSnapshot | null>(null);
  const isReplayingRef = useRef(false);
  const elementsRef = useRef<unknown[]>([]);
  const aiRequestRef = useRef(makeId("request"));
  const assistantTextRef = useRef("");
  const fallbackTimerRef = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? starterSessions[0],
    [activeSessionId, sessions],
  );

  const filteredSessions = useMemo(() => {
    const query = sessionQuery.trim().toLocaleLowerCase("ja-JP");
    if (!query) return sessions;
    return sessions.filter((session) => `${session.title} ${session.tags.join(" ")}`.toLocaleLowerCase("ja-JP").includes(query));
  }, [sessionQuery, sessions]);

  const contextCount = Number(contextSettings.selection) + Number(contextSettings.image) + Number(contextSettings.objects) + Number(contextSettings.timeline);
  const complexity = Math.min(96, Math.max(12, elements.length * 5 + selectedCount * 3 + 18));

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const supported = providerOptions.find((option) => option.id === provider)?.models ?? [];
    if (!supported.includes(model)) setModel(providerModel(provider));
  }, [model, provider]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (event.key === "?" && !isEditing) {
        event.preventDefault();
        setDialog("shortcuts");
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase("en-US") === "k") {
        event.preventDefault();
        setSessionBrowserOpen(true);
        window.setTimeout(() => document.querySelector<HTMLInputElement>(".search-field input")?.focus(), 0);
      } else if (event.key === "Escape" && dialog) {
        setDialog(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialog]);

  useEffect(() => {
    let active = true;
    const loadRemote = async () => {
      const api = window.aiWhiteboard;
      try {
        const remoteSessions = await api?.sessions?.list?.();
        if (active && remoteSessions && remoteSessions.length > 0) {
          const normalized = remoteSessions.map(normalizeRemoteSession);
          setSessions(normalized);
          setActiveSessionId(normalized[0].id);
        } else if (active && api?.sessions?.create) {
          const created = await api.sessions.create({ title: "無題のホワイトボード", document: mergeSnapshot() });
          const normalized = normalizeRemoteSession(created);
          setSessions([normalized]);
          setActiveSessionId(normalized.id);
        }
      } catch {
        // Local-first mode intentionally works without the preload bridge.
      }
      try {
        const settings = await api?.settings?.get?.();
        const configuredProvider = isProviderId(settings?.activeProvider) ? settings.activeProvider : provider;
        if (active && configuredProvider !== provider) setProvider(configuredProvider);
        const configuredModel = settings?.models && typeof settings.models === "object"
          ? (settings.models as Record<string, unknown>)[configuredProvider]
          : undefined;
        if (active && typeof configuredModel === "string") setModel(configuredModel);
        const status = await api?.secrets?.status?.();
        const configured = status?.configured ?? (await api?.secrets?.has?.(configuredProvider));
        if (active) setApiKeyStatus(configured ? "connected" : "not-configured");
      } catch {
        if (active) setApiKeyStatus("not-configured");
      }
    };
    void loadRemote();
    return () => {
      active = false;
    };
  }, [setActiveSessionId, setSessions]);

  useEffect(() => {
    let active = true;
    setApiKeyStatus("checking");
    void window.aiWhiteboard?.secrets?.has?.(provider)
      .then((configured) => { if (active) setApiKeyStatus(configured ? "connected" : "not-configured"); })
      .catch(() => { if (active) setApiKeyStatus("not-configured"); });
    return () => { active = false; };
  }, [provider]);

  useEffect(() => {
    const sessionSnapshot = mergeSnapshot(activeSession?.snapshot);
    setElements(sessionSnapshot.elements);
    setAppState(sessionSnapshot.appState ?? defaultAppState);
    setFiles(sessionSnapshot.files ?? {});
    sceneRef.current = sessionSnapshot;
    elementsRef.current = sessionSnapshot.elements;
    setSelectedCount(0);
    requestAnimationFrame(() => {
      excalidrawApiRef.current?.updateScene?.({
        elements: sessionSnapshot.elements,
        appState: sessionSnapshot.appState,
        files: sessionSnapshot.files,
      });
    });
  }, [activeSessionId]);

  const appendAssistantText = useCallback((value: string) => {
    if (!value) return;
    assistantTextRef.current = `${assistantTextRef.current}${value}`;
    setAiReply((current) => ({ text: `${current.text}${value}`, status: "streaming" }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSaveState(isOnline ? "saving" : "offline");
      const snapshot = toPersistedSnapshot(sceneRef.current);
      const updatedAt = new Date().toISOString();
      setSessions((current) =>
        current.map((session) => (session.id === activeSessionId ? { ...session, updatedAt, snapshot } : session)),
      );
      const saveResult = window.aiWhiteboard?.sessions?.save?.({ id: activeSessionId, document: snapshot });
      void Promise.resolve(saveResult)
        .then(() => {
          setLastSaved(new Date(updatedAt));
          setSaveState(isOnline ? "saved" : "offline");
        })
        .catch(() => setSaveState("error"));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeSessionId, appState, elements, files, isOnline, setSessions]);

  useEffect(() => {
    const api = window.aiWhiteboard;
    const unsubscribe = api?.ai?.onEvent?.((event) => {
      if (event.type === "delta" || event.type === "text-delta") {
        appendAssistantText(event.delta ?? event.text ?? "");
      } else if (event.type === "error") {
        const errorMessage = typeof event.error === "string" ? event.error : event.error?.message;
        setAiReply({ text: "", status: "error", error: event.message ?? errorMessage ?? "AI応答を受け取れませんでした。" });
        setIsStreaming(false);
      } else if (event.type === "proposal" && event.proposal) {
        setProposal(event.proposal);
      } else if (event.type === "done") {
        setIsStreaming(false);
        setAiReply((current) => ({ ...current, status: "done" }));
        const completedText = assistantTextRef.current.trim();
        if (completedText) setConversation((current) => [...current, { role: "assistant" as const, text: completedText }].slice(-20));
      }
    });
    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [appendAssistantText, setConversation]);

  const updateSceneFromExcalidraw = useCallback((...args: any[]) => {
    if (isReplayingRef.current) return;
    const [nextElements, nextAppState, nextFiles] = args;
    const normalizedElements = Array.isArray(nextElements) ? nextElements : [];
    const normalizedAppState = nextAppState && typeof nextAppState === "object" ? nextAppState : defaultAppState;
    const normalizedFiles = nextFiles && typeof nextFiles === "object" ? nextFiles : {};
    setElements(normalizedElements);
    setAppState(normalizedAppState);
    setFiles(normalizedFiles);
    const previousSnapshot = sceneRef.current;
    const nextSnapshot = { elements: normalizedElements, appState: normalizedAppState, files: normalizedFiles };
    sceneRef.current = nextSnapshot;
    try {
      const diffEvents = diffSnapshots(toCoreSnapshot(previousSnapshot) as any, toCoreSnapshot(nextSnapshot) as any, { actor: "user", timestamp: Date.now() });
      if (diffEvents.length > 0) {
        setHistory((current) => [{ id: makeId("diff"), timestamp: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }), label: `${diffEvents.length}件の変更を記録`, detail: "@ai-whiteboard/core · diff", kind: "draw" as const, snapshot: nextSnapshot }, ...current].slice(0, 24));
      }
    } catch {
      // Excalidraw can emit transient incomplete elements while drawing; the UI stays responsive.
    }
    if (elementsRef.current.length !== normalizedElements.length) {
      const newEvent: HistoryEvent = {
        id: makeId("history"),
        timestamp: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }),
        label: normalizedElements.length > elementsRef.current.length ? "キャンバスにオブジェクトを追加" : "オブジェクトを更新",
        detail: `${normalizedElements.length} objects · local`,
        kind: "draw",
        snapshot: nextSnapshot,
      };
      setHistory((current) => [newEvent, ...current].slice(0, 24));
    }
    elementsRef.current = normalizedElements;
    const selected = normalizedAppState.selectedElementIds;
    if (selected && typeof selected === "object") setSelectedCount(Object.keys(selected as object).length);
  }, []);

  const addHistory = useCallback((label: string, kind: HistoryEvent["kind"], detail?: string) => {
    setHistory((current) => [
      { id: makeId("history"), timestamp: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }), label, kind, detail },
      ...current,
    ].slice(0, 24));
  }, []);

  const createSession = useCallback(async () => {
    const localSession: SessionRecord = {
      id: makeId("session"),
      title: "無題のホワイトボード",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      color: sessionColors[sessions.length % sessionColors.length],
      tags: ["新規"],
      snapshot: mergeSnapshot(),
    };
    let nextSession = localSession;
    try {
      const remote = await window.aiWhiteboard?.sessions?.create?.({ title: localSession.title, document: localSession.snapshot });
      if (remote) nextSession = { ...localSession, ...remote };
    } catch {
      // Keep the local draft when the native bridge is not available.
    }
    setSessions((current) => [nextSession, ...current]);
    setActiveSessionId(nextSession.id);
    setSessionBrowserOpen(false);
    addHistory("新しいセッションを作成", "session", nextSession.title);
  }, [addHistory, sessions.length, setActiveSessionId, setSessions]);

  const renameSession = useCallback(async (session: SessionRecord) => {
    const nextTitle = window.prompt("セッション名", session.title)?.trim();
    if (!nextTitle || nextTitle === session.title) return;
    setSessions((current) => current.map((item) => (item.id === session.id ? { ...item, title: nextTitle, updatedAt: new Date().toISOString() } : item)));
    try {
      await window.aiWhiteboard?.sessions?.rename?.(session.id, nextTitle);
    } catch {
      // Native persistence is optional.
    }
  }, [setSessions]);

  const deleteSession = useCallback(async (session: SessionRecord) => {
    if (sessions.length <= 1) return;
    if (!window.confirm(`「${session.title}」を削除しますか？`)) return;
    setSessions((current) => current.filter((item) => item.id !== session.id));
    if (activeSessionId === session.id) {
      const fallback = sessions.find((item) => item.id !== session.id);
      if (fallback) setActiveSessionId(fallback.id);
    }
    try {
      const remove = window.aiWhiteboard?.sessions?.remove ?? window.aiWhiteboard?.sessions?.delete;
      await remove?.(session.id);
    } catch {
      // The local copy is already updated.
    }
  }, [activeSessionId, sessions, setActiveSessionId, setSessions]);

  const importSession = useCallback(async () => {
    try {
      const result = await window.aiWhiteboard?.sessions?.import?.();
      if (!result?.session) return;
      const normalized = normalizeRemoteSession(result.session);
      setSessions((current) => [normalized, ...current.filter((item) => item.id !== normalized.id)]);
      setActiveSessionId(normalized.id);
      addHistory("セッションを読み込み", "session", normalized.title);
    } catch (error) {
      setAiReply({ text: "", status: "error", error: error instanceof Error ? error.message : "セッションを読み込めませんでした。" });
    }
  }, [addHistory, setActiveSessionId, setSessions]);

  const runFallbackResponse = useCallback((text: string) => {
    return new Promise<void>((resolve) => {
      let index = 0;
      const tick = () => {
        if (index >= text.length) {
          setAiReply((current) => ({ ...current, status: "done" }));
          resolve();
          return;
        }
        const next = text.slice(index, index + 5);
        index += 5;
        appendAssistantText(next);
        fallbackTimerRef.current = window.setTimeout(tick, 22);
      };
      tick();
    });
  }, [appendAssistantText]);

  const sendPrompt = useCallback(async (retryMessage?: string) => {
    const message = (retryMessage ?? prompt).trim();
    if (!message || isStreaming) return;
    const selectedElementIdsValue = appState.selectedElementIds;
    const selectedIds = selectedElementIdsValue instanceof Map
      ? [...selectedElementIdsValue.keys()].map(String)
      : selectedElementIdsValue && typeof selectedElementIdsValue === "object"
        ? Object.keys(selectedElementIdsValue)
        : [];
    if (selectedOnly && selectedIds.length === 0) {
      setAiReply({ text: "", status: "error", error: "送信するオブジェクトを選択してください。キャンバス全体は送信していません。" });
      return;
    }
    const requestId = makeId("request");
    aiRequestRef.current = requestId;
    setPrompt("");
    setIsStreaming(true);
    assistantTextRef.current = "";
    setAiReply({ text: "", status: "streaming" });
    setConversation((current) => [...current, { role: "user" as const, text: message }].slice(-20));
    addHistory("AIにプロンプトを送信", "ai", selectedOnly ? "selection only" : `${contextCount} context sources`);

    const proposalKeywords = /整理|追加|変更|提案|図|比較|構造化/.test(message);
    try {
      const scopedElements = scopeCanvasElements(elements, selectedIds, selectedOnly);
      const scopedSnapshot = { elements: scopedElements, appState, files };
      const coreSnapshot = toCoreSnapshot(scopedSnapshot);
      let renderedImage: { mimeType: string; width: number; height: number; dataUrl: string; source: "canvas" | "selection" } | undefined;
      if (contextSettings.image && scopedElements.length > 0) {
        const blob = await exportToBlob({ elements: scopedElements as any, appState: appState as any, files: files as any, mimeType: "image/png" });
        renderedImage = {
          mimeType: "image/png",
          width: typeof appState.width === "number" && appState.width > 0 ? Math.round(appState.width) : 1920,
          height: typeof appState.height === "number" && appState.height > 0 ? Math.round(appState.height) : 1080,
          dataUrl: await blobToDataUrl(blob),
          source: selectedOnly ? "selection" : "canvas",
        };
      }
      const awcp = applyPrivacySwitches(buildAWCPRequest({
        requestId,
        userPrompt: message,
        snapshot: coreSnapshot as any,
        renderedImage,
        structures: contextSettings.objects ? scopedElements.map((element) => {
          const item = element as Record<string, unknown>;
          return {
            id: String(item.id ?? makeId("object")),
            kind: String(item.type ?? "unknown"),
            text: typeof item.text === "string" ? item.text : undefined,
            bounds: {
              x: typeof item.x === "number" ? item.x : 0,
              y: typeof item.y === "number" ? item.y : 0,
              width: Math.max(1, typeof item.width === "number" ? item.width : 1),
              height: Math.max(1, typeof item.height === "number" ? item.height : 1),
            },
            elementIds: [String(item.id ?? "")].filter(Boolean),
          };
        }) : [],
        timeline: contextSettings.timeline ? history.map((event, index) => ({
          seq: history.length - index,
          timestamp: Date.now() - index,
          kind: event.kind,
          summary: `${event.label}${event.detail ? ` — ${event.detail}` : ""}`,
          actor: event.kind === "ai" ? "ai" : "user",
        })) : [],
        selection: contextSettings.selection && selectedIds.length > 0 ? { elementIds: selectedIds } : undefined,
        privacySwitches: {
          includeRenderedImage: contextSettings.image,
          includeRawText: true,
          includeTimeline: contextSettings.timeline,
          includeSelection: contextSettings.selection,
          includeSemanticInference: contextSettings.objects,
          redactSensitiveText: false,
          localOnly: false,
        },
        metadata: {
          sessionId: activeSessionId,
          semantics: contextSettings.objects ? extractSemantics(coreSnapshot as any) : undefined,
        },
      }));
      const contract = promptContractText(buildPromptContract({
        userPrompt: message,
        interactionTimeline: awcp.timeline,
      }));
      const request = {
        sessionId: activeSessionId,
        prompt: message,
        context: awcp,
      };
      const result = window.aiWhiteboard?.ai?.send
        ? await window.aiWhiteboard.ai.send(request)
        : await window.aiWhiteboard?.ai?.start?.({
          provider,
          model,
          messages: [
            { role: "system", content: contract },
            {
              role: "user",
              content: renderedImage
                ? [{ type: "text", text: message }, { type: "image", data: renderedImage.dataUrl, mimeType: renderedImage.mimeType, alt: "AI Whiteboard canvas" }]
                : message,
            },
          ],
          context: request.context,
          sessionId: activeSessionId,
        });
      if (typeof result === "string") appendAssistantText(result);
      else if (result && typeof result === "object" && "text" in result) appendAssistantText(String((result as { text?: unknown }).text ?? ""));
      else if (result && typeof result === "object" && "requestId" in result) aiRequestRef.current = String((result as { requestId: unknown }).requestId);
      if (!window.aiWhiteboard?.ai?.send && !window.aiWhiteboard?.ai?.start) {
        await runFallbackResponse(`「${message}」について、現在のキャンバスを読み取りました。\n\n${selectedOnly ? "選択範囲だけ" : "キャンバス全体"}を対象に、次の一歩を提案できます。まずは観察した事実と、まだ確かめたい問いを分けて整理します。`);
        setIsStreaming(false);
        const completedText = assistantTextRef.current.trim();
        if (completedText) {
          setConversation((current) => [...current, { role: "assistant" as const, text: completedText }].slice(-20));
        }
      } else if (window.aiWhiteboard?.ai?.send) {
        setAiReply((current) => ({ ...current, status: current.text ? "done" : "streaming" }));
        setIsStreaming(false);
        const completedText = assistantTextRef.current.trim();
        if (completedText) {
          setConversation((current) => [...current, { role: "assistant" as const, text: completedText }].slice(-20));
        }
      }
      if (proposalKeywords) {
        const targetIds = new Set(selectedOnly ? selectedIds : scopedElements.slice(0, 12).map((item) => String((item as { id?: unknown }).id ?? "")));
        const targetElements = scopedElements.filter((item) => targetIds.has(String((item as { id?: unknown }).id ?? "")));
        const minX = Math.min(...targetElements.map((item) => Number((item as { x?: unknown }).x) || 0), 0);
        const minY = Math.min(...targetElements.map((item) => Number((item as { y?: unknown }).y) || 0), 0);
        const arranged = elements.map((item) => {
          const id = String((item as { id?: unknown }).id ?? "");
          const index = targetElements.findIndex((candidate) => String((candidate as { id?: unknown }).id ?? "") === id);
          if (index < 0) return item;
          return { ...(item as Record<string, unknown>), x: minX + (index % 3) * 240, y: minY + Math.floor(index / 3) * 160 };
        });
        setProposal({
          id: makeId("proposal"),
          title: "キャンバスの構造を整える提案",
          source: `AI · ${model} · AWCP ${awcp.canvasFingerprint ?? "local"} · ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`,
          changes: [
            { label: "対象オブジェクトを整列", detail: `${targetElements.length} objects · 3列グリッド` },
            { label: "対象外の配置を保持", detail: `${Math.max(0, elements.length - targetElements.length)} objects unchanged` },
          ],
          status: "pending",
          nextSnapshot: { elements: arranged, appState, files },
        });
      }
    } catch (error) {
      setAiReply({ text: "", status: "error", error: error instanceof Error ? error.message : "AI応答を受け取れませんでした。" });
      setIsStreaming(false);
    }
  }, [activeSessionId, addHistory, appState, appendAssistantText, contextCount, contextSettings, elements, files, history, isStreaming, model, prompt, provider, runFallbackResponse, selectedCount, selectedOnly, setConversation]);

  const cancelPrompt = useCallback(() => {
    if (fallbackTimerRef.current !== null) window.clearTimeout(fallbackTimerRef.current);
    fallbackTimerRef.current = null;
    setIsStreaming(false);
    setAiReply((current) => ({ ...current, status: current.text ? "done" : "idle" }));
    void window.aiWhiteboard?.ai?.cancel?.(aiRequestRef.current);
  }, []);

  const retryPrompt = useCallback(() => {
    const lastPrompt = [...conversation].reverse().find((item) => item.role === "user")?.text;
    if (lastPrompt) {
      setPrompt(lastPrompt);
      void sendPrompt(lastPrompt);
    }
  }, [conversation, sendPrompt]);

  const toggleVoice = useCallback(() => {
    if (voiceState === "listening") {
      recognitionRef.current?.stop();
      setVoiceState("idle");
      return;
    }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState("unsupported");
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.lang = "ja-JP";
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let transcript = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
        setPrompt((current) => `${current}${transcript}`.trimStart());
      };
      recognition.onerror = () => setVoiceState("error");
      recognition.onend = () => setVoiceState("idle");
      recognitionRef.current = recognition;
      recognition.start();
      setVoiceState("listening");
    } catch {
      setVoiceState("error");
    }
  }, [voiceState]);

  const downloadOrSave = useCallback(async (name: string, data: string | Blob, mimeType: string) => {
    if (typeof data === "string") {
      const nativeSave = window.aiWhiteboard?.dialogs?.saveFile;
      if (nativeSave) {
        await nativeSave({ name, data, mimeType });
        return;
      }
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const copyText = useCallback(async (value: string) => {
    if (window.aiWhiteboard?.clipboard?.writeText) {
      await window.aiWhiteboard.clipboard.writeText(value);
      return;
    }
    if (window.aiWhiteboard?.clipboard?.write) {
      await window.aiWhiteboard.clipboard.write({ text: value });
      return;
    }
    await navigator.clipboard?.writeText(value);
  }, []);

  const exportCanvas = useCallback(async (format: ExportFormat) => {
    const safeTitle = (activeSession?.title ?? "whiteboard").replace(/[^\w\-ぁ-んァ-ヶ一-龠]+/g, "-").slice(0, 48);
    try {
      if (format === "session") {
        await window.aiWhiteboard?.sessions?.export?.(activeSessionId, "session");
      } else if (format === "json") {
        const json = serializeAsJSON(elements as any, appState as any, files as any, "local");
        await downloadOrSave(`${safeTitle}.excalidraw.json`, json, "application/json");
      } else if (format === "capsule") {
        const capsule = JSON.stringify(exportContextCapsule({
          capsuleId: makeId("capsule"),
          createdAt: Date.now(),
          source: selectedOnly ? "selection" : "canvas",
          canvas: toCoreSnapshot(sceneRef.current) as any,
          metadata: { session: activeSession, history: history.slice(0, 24) },
        }), null, 2);
        await copyText(capsule);
        addHistory("コンテキストカプセルをコピー", "export", "JSON capsule");
      } else if (format === "markdown") {
        const semantics = extractSemantics(toCoreSnapshot(sceneRef.current) as any);
        const markdown = [
          `# ${activeSession?.title ?? "AI Whiteboard"}`,
          "",
          `- Exported: ${new Date().toISOString()}`,
          `- Objects: ${elements.length}`,
          `- Scope: ${selectedOnly ? `selection (${selectedCount})` : "canvas"}`,
          "",
          "## Semantic objects",
          "",
          ...semantics.elements.map((item) => `- **${item.inferred.role}** — ${item.inferred.label ?? item.elementId} (source: \`${item.elementId}\`, confidence: ${item.inferred.confidence.toFixed(2)})`),
          "",
          "## Relations",
          "",
          ...(semantics.relations.length > 0
            ? semantics.relations.map((relation) => `- \`${relation.fromElementId}\` → \`${relation.toElementId}\` (${relation.relation}, confidence: ${relation.confidence.toFixed(2)})`)
            : ["- None"]),
          "",
          "## Recent history",
          "",
          ...history.slice(0, 24).map((item) => `- ${item.timestamp} — ${item.label}${item.detail ? ` (${item.detail})` : ""}`),
        ].join("\n");
        await downloadOrSave(`${safeTitle}.md`, markdown, "text/markdown");
      } else if (format === "pdf") {
        const svg = await exportToSvg({ elements: elements as any, appState: appState as any, files: files as any });
        if (window.aiWhiteboard?.dialogs?.exportPdf) {
          await window.aiWhiteboard.dialogs.exportPdf({ name: `${safeTitle}.pdf`, svg: svg.outerHTML });
        } else {
          await downloadOrSave(`${safeTitle}.svg`, svg.outerHTML, "image/svg+xml");
        }
      } else if (format === "svg") {
        const svg = await exportToSvg({ elements: elements as any, appState: appState as any, files: files as any });
        await downloadOrSave(`${safeTitle}.svg`, svg.outerHTML, "image/svg+xml");
      } else {
        const blob = await exportToBlob({ elements: elements as any, appState: appState as any, files: files as any, mimeType: "image/png" });
        await downloadOrSave(`${safeTitle}.png`, blob, "image/png");
      }
      addHistory(`${format.toUpperCase()}を書き出し`, "export", activeSession?.title);
    } catch {
      setAiReply({ text: "", status: "error", error: "書き出しに失敗しました。もう一度お試しください。" });
    }
  }, [activeSession, activeSessionId, addHistory, appState, copyText, elements, files, history, selectedCount, selectedOnly]);

  const copyContext = useCallback(async () => {
    const text = [
      `# ${activeSession?.title ?? "AI Whiteboard"}`,
      `対象: ${selectedOnly ? `選択範囲（${selectedCount} objects）` : "キャンバス全体"}`,
      `オブジェクト: ${elements.length}`,
      `コンテキスト: ${contextCount} sources`,
      "",
      history.slice(0, 4).map((item) => `- ${item.timestamp} ${item.label}`).join("\n"),
    ].join("\n");
    try {
      await copyText(text);
      addHistory("コンテキストをクリップボードにコピー", "export", "plain text");
    } catch {
      setAiReply({ text: "", status: "error", error: "クリップボードを利用できません。" });
    }
  }, [activeSession, addHistory, contextCount, copyText, elements.length, history, selectedCount, selectedOnly]);

  const acceptProposal = useCallback(() => {
    if (!proposal) return;
    if (proposal.nextSnapshot) {
      const next = mergeSnapshot(proposal.nextSnapshot);
      sceneRef.current = next;
      elementsRef.current = next.elements;
      setElements(next.elements);
      setAppState(next.appState ?? defaultAppState);
      setFiles(next.files ?? {});
      excalidrawApiRef.current?.updateScene?.({ elements: next.elements, appState: next.appState, files: next.files });
      setHistory((current) => [{ id: makeId("history"), timestamp: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }), label: "AI提案を適用", kind: "ai" as const, detail: proposal.title, snapshot: next }, ...current].slice(0, 24));
    }
    setProposal({ ...proposal, status: "accepted" });
  }, [proposal]);

  const rejectProposal = useCallback(() => {
    if (!proposal) return;
    setProposal({ ...proposal, status: "rejected" });
    addHistory("AI提案を却下", "ai", proposal.title);
  }, [addHistory, proposal]);

  const saveSettings = useCallback(async () => {
    try {
      const settingsPatch = { activeProvider: provider, models: { [provider]: model } };
      if (window.aiWhiteboard?.settings?.update) await window.aiWhiteboard.settings.update(settingsPatch);
      else await window.aiWhiteboard?.settings?.set?.(settingsPatch);
      if (apiKeyDraft.trim()) {
        await window.aiWhiteboard?.secrets?.set?.(provider, apiKeyDraft.trim());
        setApiKeyStatus("connected");
        setApiKeyDraft("");
      }
      setSettingsSaved(true);
      window.setTimeout(() => setSettingsSaved(false), 1800);
    } catch {
      setApiKeyStatus("not-configured");
    }
  }, [apiKeyDraft, model, provider]);

  const openLibrary = useCallback(() => {
    excalidrawApiRef.current?.toggleSidebar?.({ name: "library" });
  }, []);

  const handleModeChange = useCallback((nextMode: ViewMode) => {
    setViewMode(nextMode);
    void window.aiWhiteboard?.window?.setMode?.(nextMode);
  }, [setViewMode]);

  const toggleContext = useCallback((key: keyof ContextSettings) => {
    setContextSettings((current) => ({ ...current, [key]: !current[key] }));
  }, [setContextSettings]);

  const scrubHistory = useCallback((index: number) => {
    setHistoryIndex(index);
    if (!isReplayingRef.current) return;
    const target = history[index]?.snapshot;
    if (target) excalidrawApiRef.current?.updateScene?.(mergeSnapshot(target));
  }, [history]);

  const toggleReplay = useCallback(() => {
    if (isReplayingRef.current) {
      setReplayMode(false);
      const live = replayBaseRef.current;
      replayBaseRef.current = null;
      if (live) excalidrawApiRef.current?.updateScene?.(mergeSnapshot(live));
      requestAnimationFrame(() => {
        isReplayingRef.current = false;
      });
      return;
    }
    replayBaseRef.current = sceneRef.current;
    isReplayingRef.current = true;
    setReplayMode(true);
    const target = history[historyIndex]?.snapshot;
    if (target) excalidrawApiRef.current?.updateScene?.(mergeSnapshot(target));
  }, [history, historyIndex]);

  return (
    <div className={`app-shell theme-${theme} mode-${viewMode} ${sessionBrowserOpen ? "has-session-drawer" : ""} ${lensOpen ? "has-context-lens" : ""}`}>
      <header className="instrument-rail">
        <div className="brand-lockup" aria-label="AI Whiteboard">
          <div className="brand-mark" aria-hidden="true"><span>AI</span></div>
          <div className="brand-copy">
            <strong>AI Whiteboard</strong>
            <span>LOCAL / DRAFTING INSTRUMENT</span>
          </div>
        </div>

        <button className="session-current" type="button" onClick={() => setSessionBrowserOpen((open) => !open)} aria-expanded={sessionBrowserOpen}>
          <span className={`session-dot dot-${activeSession?.color ?? "blue"}`} />
          <span className="session-current-copy"><small>SESSION</small><strong>{activeSession?.title ?? "無題のホワイトボード"}</strong></span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>

        <div className="rail-center-status">
          <span className={`save-indicator ${saveState}`}><span />{saveState === "saving" ? "保存中" : saveState === "offline" ? "オフライン保存" : saveState === "error" ? "保存失敗" : "自動保存済み"}</span>
          <span className="rail-divider" />
          <span className="last-saved">{formatUpdatedAt(lastSaved.toISOString())}</span>
        </div>

        <div className="rail-actions">
          <div className="mode-switch" aria-label="表示モード">
            {(["quick", "full", "dock", "inspect"] as ViewMode[]).map((mode) => (
              <button key={mode} type="button" className={viewMode === mode ? "is-active" : ""} onClick={() => handleModeChange(mode)}>
                {mode === "quick" ? "Quick" : mode === "full" ? "Full" : mode === "dock" ? "Dock" : "Inspect"}
              </button>
            ))}
          </div>
          <IconButton label="セッションの履歴" onClick={() => { setLensTab("timeline"); setLensOpen(true); }}><History size={17} /></IconButton>
          <IconButton label={theme === "light" ? "ダークテーマ" : "ライトテーマ"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </IconButton>
          <IconButton label="キーボードショートカット" onClick={() => setDialog("shortcuts")}><Keyboard size={17} /></IconButton>
          <IconButton label="はじめての方へ" onClick={() => { setOnboardingStep(0); setDialog("onboarding"); }}><CircleHelp size={17} /></IconButton>
          <IconButton label="設定" onClick={() => setDialog("settings")}><Settings2 size={17} /></IconButton>
        </div>
      </header>

      <main className="workspace">
        {sessionBrowserOpen && (
          <aside className="session-drawer" aria-label="セッションブラウザ">
            <div className="drawer-heading">
              <div><span className="eyebrow">WORKSPACE</span><h2>セッション</h2></div>
              <IconButton label="セッションブラウザを閉じる" onClick={() => setSessionBrowserOpen(false)}><PanelLeft size={16} /></IconButton>
            </div>
            <div className="drawer-tools">
              <label className="search-field"><Search size={15} aria-hidden="true" /><input value={sessionQuery} onChange={(event) => setSessionQuery(event.target.value)} placeholder="検索…" aria-label="セッションを検索" /><kbd>⌘ K</kbd></label>
              <IconButton label="新しいセッション" tone="blue" onClick={() => void createSession()}><Plus size={17} /></IconButton>
            </div>
            <div className="session-list" role="list">
              <div className="list-caption"><span>最近のボード</span><span>{filteredSessions.length.toString().padStart(2, "0")}</span></div>
              {filteredSessions.map((session) => (
                <div key={session.id} className={`session-item ${session.id === activeSessionId ? "is-active" : ""}`} role="listitem">
                  <button type="button" className="session-item-main" onClick={() => { setActiveSessionId(session.id); setSessionBrowserOpen(false); }}>
                    <span className={`session-thumb thumb-${session.color}`}><span /><span /><span /></span>
                    <span className="session-item-copy"><strong>{session.title}</strong><small>{formatUpdatedAt(session.updatedAt)} · {session.snapshot?.elements?.length ?? 12} objects</small><span className="tag-row">{session.tags.map((tag) => <em key={tag}>{tag}</em>)}</span></span>
                  </button>
                  <div className="session-item-actions">
                    <IconButton label={`${session.title}の名前を変更`} onClick={() => void renameSession(session)}><PenLine size={13} /></IconButton>
                    <IconButton label={`${session.title}を削除`} onClick={() => void deleteSession(session)}><Trash2 size={13} /></IconButton>
                  </div>
                </div>
              ))}
              {filteredSessions.length === 0 && <div className="empty-state"><Search size={21} /><p>一致するセッションがありません。</p><button type="button" onClick={() => setSessionQuery("")}>検索をクリア</button></div>}
            </div>
            <div className="drawer-footer">
              <button type="button" onClick={() => setDialog("onboarding")}><BookOpen size={15} />使い方を見る</button>
              <span className="local-badge"><ShieldCheck size={13} />端末内に保存</span>
            </div>
          </aside>
        )}

        <section className="board-column" aria-label="ホワイトボード">
          <div className="board-toolbar">
            <div className="breadcrumb"><span>MY BOARDS</span><ArrowRight size={12} /><strong>{activeSession?.title}</strong></div>
            <div className="board-toolbar-actions">
              <button type="button" className="tool-button" onClick={openLibrary}><Grid2X2 size={15} />ライブラリ</button>
              <button type="button" className="tool-button" onClick={() => void importSession()}><FolderOpen size={15} />読み込み</button>
              <button type="button" className="tool-button" onClick={() => setDialog("export")}><ArrowDownToLine size={15} />書き出し</button>
              <IconButton label="セッションブラウザを開く" active={sessionBrowserOpen} onClick={() => setSessionBrowserOpen((open) => !open)}><PanelLeft size={16} /></IconButton>
              <IconButton label="コンテキストレンズを開く" active={lensOpen} onClick={() => setLensOpen((open) => !open)}><PanelRight size={16} /></IconButton>
            </div>
          </div>
          <div className="canvas-frame">
            <div className="canvas-meta top-left"><span className="coordinate-mark">01</span><span>BOARD / {viewMode.toUpperCase()}</span></div>
            <div className="canvas-meta top-right"><span className="online-mark"><span />{isOnline ? "SYNC READY" : "LOCAL ONLY"}</span><span className="canvas-zoom">100%</span></div>
            <Excalidraw
              excalidrawAPI={(api) => { excalidrawApiRef.current = api as unknown as ExcalidrawApi; }}
              initialData={{ elements: elements as any, appState: appState as any, files: files as any }}
              onChange={updateSceneFromExcalidraw}
              UIOptions={{ canvasActions: { export: false, saveToActiveFile: false } }}
              theme={theme}
            />
            <div className="canvas-scene-hint" aria-hidden="true">
              <div className="scene-hint-line"><span className="scene-hint-dot" /><span>描く、選ぶ、問いかける</span></div>
              <div className="scene-hint-code">/ {activeSession?.title ?? "new board"}</div>
            </div>
            <div className="canvas-insights">
              <div className="complexity-readout"><span className="eyebrow">COMPLEXITY</span><strong>{complexity}<small>/100</small></strong><span className="complexity-meter"><i style={{ width: `${complexity}%` }} /></span><small>manageable</small></div>
              <div className="mini-map" aria-label="キャンバスミニマップ"><span className="mini-map-view" />{[0, 1, 2, 3, 4, 5, 6].map((dot) => <i key={dot} style={{ left: `${17 + dot * 10}%`, top: `${30 + (dot % 3) * 17}%` }} />)}</div>
            </div>
            <div className="canvas-bottom-tools">
              <IconButton label="キャンバスを中央に戻す" onClick={() => excalidrawApiRef.current?.scrollToContent?.()}><Maximize2 size={15} /></IconButton>
              <IconButton label="元に戻す" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }))}><RotateCcw size={15} /></IconButton>
              <span className="canvas-divider" />
              <span className="canvas-elements"><Layers3 size={14} />{elements.length} objects</span>
            </div>
          </div>
          {aiReply.status !== "idle" && (
            <section className={`assistant-dock ${aiReply.status}`} aria-live="polite">
              <div className="assistant-dock-heading"><span className="assistant-orb"><Sparkles size={14} /></span><div><span className="eyebrow">AI RESPONSE · {model}</span><strong>{aiReply.status === "error" ? "接続を確認してください" : isStreaming ? "考えています…" : "キャンバスへのメモ"}</strong></div>{isStreaming ? <Loader2 className="spin" size={16} /> : <IconButton label="AI応答を閉じる" onClick={() => setAiReply({ text: "", status: "idle" })}><X size={15} /></IconButton>}</div>
              {aiReply.status === "error" ? <div className="assistant-error"><Info size={15} /><span>{aiReply.error}</span><button type="button" onClick={retryPrompt}><RefreshCcw size={14} />再試行</button></div> : <p>{aiReply.text || "応答を準備しています…"}</p>}
            </section>
          )}
          <PromptComposer
            prompt={prompt}
            setPrompt={setPrompt}
            selectedOnly={selectedOnly}
            selectedCount={selectedCount}
            contextCount={contextCount}
            onToggleSelected={() => setSelectedOnly((value) => !value)}
            onSend={() => void sendPrompt()}
            onCancel={cancelPrompt}
            isStreaming={isStreaming}
            voiceState={voiceState}
            onVoice={toggleVoice}
            onCopy={copyContext}
            onPrivacy={() => setDialog("settings")}
          />
        </section>

        {lensOpen && (
          <ContextLens
            activeTab={lensTab}
            setActiveTab={setLensTab}
            contextSettings={contextSettings}
            toggleContext={toggleContext}
            selectedCount={selectedCount}
            selectedOnly={selectedOnly}
            setSelectedOnly={setSelectedOnly}
            elements={elements}
            history={history}
            historyIndex={historyIndex}
            setHistoryIndex={scrubHistory}
            replayMode={replayMode}
            toggleReplay={toggleReplay}
            proposal={proposal}
            onAcceptProposal={acceptProposal}
            onRejectProposal={rejectProposal}
            onClose={() => setLensOpen(false)}
            onCopy={copyContext}
          />
        )}
      </main>

      {dialog === "onboarding" && <OnboardingDialog step={onboardingStep} setStep={setOnboardingStep} onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutDialog onClose={() => setDialog(null)} />}
      {dialog === "export" && <ExportDialog onClose={() => setDialog(null)} onExport={exportCanvas} />}
      {dialog === "settings" && (
        <SettingsDialog
          provider={provider}
          model={model}
          apiKeyStatus={apiKeyStatus}
          apiKeyDraft={apiKeyDraft}
          setProvider={setProvider}
          setModel={setModel}
          setApiKeyDraft={setApiKeyDraft}
          settingsSaved={settingsSaved}
          onSave={() => void saveSettings()}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function PromptComposer({
  prompt,
  setPrompt,
  selectedOnly,
  selectedCount,
  contextCount,
  onToggleSelected,
  onSend,
  onCancel,
  isStreaming,
  voiceState,
  onVoice,
  onCopy,
  onPrivacy,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  selectedOnly: boolean;
  selectedCount: number;
  contextCount: number;
  onToggleSelected: () => void;
  onSend: () => void;
  onCancel: () => void;
  isStreaming: boolean;
  voiceState: "idle" | "listening" | "unsupported" | "error";
  onVoice: () => void;
  onCopy: () => void;
  onPrivacy: () => void;
}) {
  return (
    <section className="prompt-composer" aria-label="AIプロンプト">
      <div className="composer-topline"><span className="composer-rule" /><span>ASK THE BOARD</span><span className="composer-context-count">{contextCount} context sources</span></div>
      <div className="composer-box">
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder="このキャンバスについて、次に何を考える？"
          aria-label="AIへのプロンプト"
          rows={2}
        />
        <div className="composer-actions">
          <div className="composer-left-actions">
            <button type="button" className={`context-attach ${selectedOnly ? "is-active" : ""}`} onClick={onToggleSelected}><Box size={15} />{selectedOnly ? `選択範囲 ${selectedCount}` : "選択範囲を添付"}</button>
            <IconButton label="コンテキストをコピー" onClick={onCopy}><Copy size={15} /></IconButton>
            <IconButton label={voiceState === "listening" ? "音声入力を停止" : "音声入力"} active={voiceState === "listening"} onClick={onVoice}><Mic size={15} /></IconButton>
            {voiceState === "unsupported" && <span className="voice-note">音声入力はこの環境では利用できません</span>}
            {voiceState === "error" && <span className="voice-note is-error">マイクを確認してください</span>}
          </div>
          <div className="composer-right-actions">
            <span className="composer-shortcut"><kbd>⌘</kbd><kbd>↵</kbd></span>
            {isStreaming ? <button type="button" className="send-button is-cancel" onClick={onCancel}><Square size={13} fill="currentColor" />停止</button> : <button type="button" className="send-button" onClick={onSend} disabled={!prompt.trim()}><Send size={15} />送信</button>}
          </div>
        </div>
      </div>
      <div className="composer-footnote"><LockKeyhole size={12} />この質問は選択範囲とオンにしたコンテキストだけを参照します<span>•</span><button type="button" onClick={onPrivacy}>プライバシー設定</button></div>
    </section>
  );
}

function ContextLens({
  activeTab,
  setActiveTab,
  contextSettings,
  toggleContext,
  selectedCount,
  selectedOnly,
  setSelectedOnly,
  elements,
  history,
  historyIndex,
  setHistoryIndex,
  replayMode,
  toggleReplay,
  proposal,
  onAcceptProposal,
  onRejectProposal,
  onClose,
  onCopy,
}: {
  activeTab: LensTab;
  setActiveTab: (tab: LensTab) => void;
  contextSettings: ContextSettings;
  toggleContext: (key: keyof ContextSettings) => void;
  selectedCount: number;
  selectedOnly: boolean;
  setSelectedOnly: (value: boolean) => void;
  elements: unknown[];
  history: HistoryEvent[];
  historyIndex: number;
  setHistoryIndex: (value: number) => void;
  replayMode: boolean;
  toggleReplay: () => void;
  proposal: ProposedCanvasChange | null;
  onAcceptProposal: () => void;
  onRejectProposal: () => void;
  onClose: () => void;
  onCopy: () => void;
}) {
  const tabs: Array<{ id: LensTab; label: string; icon: ReactNode; count?: string }> = [
    { id: "image", label: "Image", icon: <ImageIcon size={15} />, count: contextSettings.image ? "ON" : "OFF" },
    { id: "objects", label: "Objects", icon: <Box size={15} />, count: contextSettings.objects ? `${elements.length}` : "OFF" },
    { id: "timeline", label: "Timeline", icon: <History size={15} />, count: `${history.length}` },
    { id: "selection", label: "Selection", icon: <PenLine size={15} />, count: `${selectedCount}` },
  ];

  return (
    <aside className="context-lens" aria-label="コンテキストレンズ">
      <div className="lens-spine" aria-hidden="true"><span>CONTEXT LENS</span><i /><i /><i /><i /><small>PRE-SEND</small></div>
      <div className="lens-body">
        <div className="lens-header"><div><span className="eyebrow">CONTEXT / 送信前</span><h2>レンズ</h2></div><IconButton label="コンテキストレンズを閉じる" onClick={onClose}><PanelRight size={16} /></IconButton></div>
        <div className="lens-tabs" role="tablist" aria-label="コンテキストの種類">
          {tabs.map((tab) => <button type="button" key={tab.id} role="tab" aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "is-active" : ""} onClick={() => setActiveTab(tab.id)}><span>{tab.icon}{tab.label}</span><small>{tab.count}</small></button>)}
        </div>
        <div className="lens-content">
          {activeTab === "image" && <ImageLens enabled={contextSettings.image} toggle={() => toggleContext("image")} />}
          {activeTab === "objects" && <ObjectLens elements={elements} selectedCount={selectedCount} proposal={proposal} onAcceptProposal={onAcceptProposal} onRejectProposal={onRejectProposal} enabled={contextSettings.objects} toggle={() => toggleContext("objects")} />}
          {activeTab === "timeline" && <TimelineLens history={history} historyIndex={historyIndex} setHistoryIndex={setHistoryIndex} replayMode={replayMode} toggleReplay={toggleReplay} timelineEnabled={contextSettings.timeline} toggle={() => toggleContext("timeline")} />}
          {activeTab === "selection" && <SelectionLens selectedCount={selectedCount} selectedOnly={selectedOnly} setSelectedOnly={setSelectedOnly} enabled={contextSettings.selection} toggle={() => toggleContext("selection")} onCopy={onCopy} />}
        </div>
        <div className="lens-footer"><span><span className="status-pip" />送信前に確認</span><span>{Object.values(contextSettings).filter(Boolean).length}/4 ON</span></div>
      </div>
    </aside>
  );
}

function LensToggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return <button type="button" className={`lens-toggle ${enabled ? "is-on" : ""}`} aria-pressed={enabled} onClick={onToggle}><span>{label}</span><i><b /></i></button>;
}

function ImageLens({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  return (
    <div className="lens-panel image-lens">
      <div className="panel-intro"><span className="panel-number">01</span><div><h3>Image</h3><p>キャンバスの視覚表現</p></div><LensToggle label="参照" enabled={enabled} onToggle={toggle} /></div>
      <div className="image-dropzone"><ImageIcon size={20} /><strong>送信時にPNGを生成</strong><span>画像はExcalidrawへドロップまたは貼り付けできます</span></div>
      <div className="empty-detail"><ShieldCheck size={16} /><span>{enabled ? "画像を送信内容に含めます" : "画像データは送信しません"}</span></div>
      <div className="privacy-note"><ShieldCheck size={14} /><span>選択範囲だけを送る場合、画像もその範囲に限定されます。</span></div>
    </div>
  );
}

function ObjectLens({ elements, selectedCount, proposal, onAcceptProposal, onRejectProposal, enabled, toggle }: { elements: unknown[]; selectedCount: number; proposal: ProposedCanvasChange | null; onAcceptProposal: () => void; onRejectProposal: () => void; enabled: boolean; toggle: () => void }) {
  const visible = elements.slice(0, 5).map((value, index) => {
    const item = value as Record<string, unknown>;
    return {
      id: String(item.id ?? index),
      type: String(item.type ?? "object"),
      label: typeof item.text === "string" && item.text.trim() ? item.text.trim().slice(0, 42) : `${String(item.type ?? "object")} ${index + 1}`,
      x: Math.round(Number(item.x) || 0),
      y: Math.round(Number(item.y) || 0),
    };
  });
  return (
    <div className="lens-panel object-lens">
      <div className="panel-intro"><span className="panel-number">02</span><div><h3>Objects</h3><p>意味のあるオブジェクト</p></div><LensToggle label="参照" enabled={enabled} onToggle={toggle} /><span className="object-counter">{elements.length.toString().padStart(2, "0")}</span></div>
      <div className="object-stack">
        {visible.map((item, index) => <div key={item.id} className={`object-card ${index < selectedCount ? "is-selected" : ""}`}><span className={`object-icon ${index % 2 ? "blue" : "coral"}`}><Box size={14} /></span><div><strong>{item.label}</strong><small>{item.type} · x {item.x}, y {item.y}</small></div>{index < selectedCount ? <CheckCircle2 size={15} /> : <span />}</div>)}
        {visible.length === 0 && <div className="empty-detail"><Box size={16} /><span>キャンバスにオブジェクトを置くと、ここで送信範囲を確認できます。</span></div>}
      </div>
      <div className="object-summary"><span>選択中</span><strong>{selectedCount} objects</strong><small>AIが参照できる意味単位</small></div>
      {proposal ? <ProposalCard proposal={proposal} onAccept={onAcceptProposal} onReject={onRejectProposal} /> : <div className="proposal-placeholder"><WandSparkles size={15} /><span>プロンプトで「整理」「追加」と頼むと、適用前の提案をここで確認できます。</span></div>}
    </div>
  );
}

function ProposalCard({ proposal, onAccept, onReject }: { proposal: ProposedCanvasChange; onAccept: () => void; onReject: () => void }) {
  return (
    <div className={`proposal-card is-${proposal.status}`}>
      <div className="proposal-heading"><span className="proposal-icon"><Sparkles size={14} /></span><div><span className="eyebrow">AI PROPOSAL · PREVIEW</span><strong>{proposal.title}</strong></div><span className="proposal-status">{proposal.status === "pending" ? "PENDING" : proposal.status.toUpperCase()}</span></div>
      <div className="proposal-changes">{proposal.changes.map((change) => <div key={change.label}><Check size={13} /><span><strong>{change.label}</strong><small>{change.detail}</small></span></div>)}</div>
      <div className="proposal-source"><Info size={12} />{proposal.source}</div>
      {proposal.status === "pending" ? <div className="proposal-actions"><button type="button" className="proposal-reject" onClick={onReject}><X size={13} />却下</button><button type="button" className="proposal-accept" onClick={onAccept}><Check size={13} />適用する</button></div> : <div className="proposal-decision"><CheckCircle2 size={14} />{proposal.status === "accepted" ? "適用済み" : "却下済み"}</div>}
    </div>
  );
}

function TimelineLens({ history, historyIndex, setHistoryIndex, replayMode, toggleReplay, timelineEnabled, toggle }: { history: HistoryEvent[]; historyIndex: number; setHistoryIndex: (value: number) => void; replayMode: boolean; toggleReplay: () => void; timelineEnabled: boolean; toggle: () => void }) {
  return (
    <div className="lens-panel timeline-lens">
      <div className="panel-intro"><span className="panel-number">03</span><div><h3>Timeline</h3><p>変更の流れとリプレイ</p></div><LensToggle label="参照" enabled={timelineEnabled} onToggle={toggle} /></div>
      <div className="replay-control"><div className="replay-topline"><span><span className="replay-dot" />{replayMode ? "リプレイ中（編集不可）" : "最新の状態"}</span><button type="button" onClick={toggleReplay}>{replayMode ? <Pause size={13} /> : <PlayIcon />}{replayMode ? "終了" : "リプレイ"}</button></div><input type="range" min={0} max={Math.max(0, history.length - 1)} value={historyIndex} onChange={(event) => setHistoryIndex(Number(event.target.value))} aria-label="履歴をスクラブ" /><div className="range-labels"><span>現在</span><span>{historyIndex} events back</span><span>過去</span></div></div>
      <div className="history-stack">{history.slice(0, 6).map((event, index) => <div key={event.id} className={`history-row ${index === historyIndex ? "is-current" : ""}`}><span className={`history-kind kind-${event.kind}`} /> <div><strong>{event.label}</strong><small>{event.detail}</small></div><time>{event.timestamp}</time></div>)}</div>
    </div>
  );
}

function PlayIcon() {
  return <span className="play-icon" aria-hidden="true" />;
}

function SelectionLens({ selectedCount, selectedOnly, setSelectedOnly, enabled, toggle, onCopy }: { selectedCount: number; selectedOnly: boolean; setSelectedOnly: (value: boolean) => void; enabled: boolean; toggle: () => void; onCopy: () => void }) {
  return (
    <div className="lens-panel selection-lens">
      <div className="panel-intro"><span className="panel-number">04</span><div><h3>Selection</h3><p>今選んでいる範囲</p></div><LensToggle label="参照" enabled={enabled} onToggle={toggle} /></div>
      <div className="selection-preview"><div className="selection-drawing"><span /><span /><span /></div><div><strong>{selectedCount} objects</strong><small>現在の選択範囲</small></div></div>
      <button type="button" className={`selection-mode ${selectedOnly ? "is-active" : ""}`} aria-pressed={selectedOnly} onClick={() => setSelectedOnly(!selectedOnly)}><span className="selection-check">{selectedOnly && <Check size={12} />}</span><span><strong>選択範囲だけを送る</strong><small>他のオブジェクトはAIに見せない</small></span></button>
      <div className="selection-actions"><button type="button" onClick={onCopy}><Copy size={14} />コンテキストをコピー</button><button type="button"><MoreHorizontal size={15} /></button></div>
      <div className="privacy-note"><LockKeyhole size={14} /><span>送信前に、対象範囲と参照ソースを確認してください。</span></div>
    </div>
  );
}

function ModalShell({ title, eyebrow, onClose, children, className = "" }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; className?: string }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className={`modal-shell ${className}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div><IconButton label="閉じる" onClick={onClose}><X size={17} /></IconButton></div>{children}</section></div>;
}

function OnboardingDialog({ step, setStep, onClose }: { step: number; setStep: (value: number) => void; onClose: () => void }) {
  const steps = [
    { number: "01", title: "考えを置く", body: "図形、手書き、画像、コード。Excalidrawの道具をそのまま使って、頭の中の仮説をまず外に出します。" },
    { number: "02", title: "文脈を選ぶ", body: "右側のContext Lensで、画像・オブジェクト・履歴・選択範囲をオン／オフ。送信前にAIへ渡す範囲を確認できます。" },
    { number: "03", title: "問いかける", body: "下のコンポーザーから質問。回答はストリーミングされ、キャンバスの変更は必ず提案として確認してから適用します。" },
  ];
  const current = steps[step] ?? steps[0];
  return <ModalShell title="はじめてのホワイトボード" eyebrow="ORIENTATION / 3 MINUTES" onClose={onClose} className="onboarding-modal"><div className="onboarding-visual"><div className="onboarding-grid" /><span className="onboarding-index">{current.number}</span><div className="onboarding-mark"><PenLine size={28} /><span>place the next<br />thought here</span></div></div><div className="onboarding-copy"><div className="step-dots">{steps.map((item, index) => <button key={item.number} type="button" className={index === step ? "is-active" : ""} aria-label={`${index + 1}ページ目`} onClick={() => setStep(index)} />)}</div><h3>{current.title}</h3><p>{current.body}</p><div className="onboarding-actions">{step > 0 ? <button type="button" className="secondary-action" onClick={() => setStep(step - 1)}><ArrowLeft size={14} />戻る</button> : <span />} {step < steps.length - 1 ? <button type="button" className="primary-action" onClick={() => setStep(step + 1)}>次へ<ArrowRight size={14} /></button> : <button type="button" className="primary-action" onClick={onClose}>ボードを始める<Check size={14} /></button>}</div></div></ModalShell>;
}

function ShortcutDialog({ onClose }: { onClose: () => void }) {
  const shortcuts = [["AIへ送信", "⌘ Enter"], ["検索を開く", "⌘ K"], ["選択範囲を添付", "⌘ Shift S"], ["元に戻す", "⌘ Z"], ["ショートカット一覧", "?"]];
  return <ModalShell title="ショートカット" eyebrow="KEYBOARD / QUICK REFERENCE" onClose={onClose} className="shortcuts-modal"><div className="shortcut-list">{shortcuts.map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><div className="modal-note"><Keyboard size={15} /><span>⌘ はWindowsではCtrlとして動作します。</span></div></ModalShell>;
}

function ExportDialog({ onClose, onExport }: { onClose: () => void; onExport: (format: ExportFormat) => void }) {
  const exports: Array<{ format: ExportFormat; label: string; detail: string; icon: ReactNode }> = [
    { format: "session", label: "AI Whiteboard session", detail: "履歴を含む再読み込み用ファイル", icon: <Archive size={18} /> },
    { format: "png", label: "PNG画像", detail: "共有しやすい静止画", icon: <ImageIcon size={18} /> },
    { format: "svg", label: "SVGベクター", detail: "図形を編集可能なまま", icon: <Share2 size={18} /> },
    { format: "pdf", label: "PDFドキュメント", detail: "A4横向きで印刷・共有", icon: <FileText size={18} /> },
    { format: "markdown", label: "Markdown", detail: "意味オブジェクトと履歴を文章化", icon: <FileText size={18} /> },
    { format: "json", label: "Excalidraw JSON", detail: "完全な編集データ", icon: <FileJson size={18} /> },
    { format: "capsule", label: "Context capsule", detail: "履歴と文脈をコピー", icon: <Archive size={18} /> },
  ];
  return <ModalShell title="書き出し" eyebrow="EXPORT / KEEP YOUR WORK" onClose={onClose} className="export-modal"><div className="export-list">{exports.map((item) => <button type="button" key={item.format} onClick={() => { onExport(item.format); onClose(); }}><span className="export-icon">{item.icon}</span><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowRight size={15} /></button>)}</div><div className="modal-note"><Info size={15} /><span>画像・PDF・構造化データを、秘密情報を含めず端末へ保存します。</span></div></ModalShell>;
}

function SettingsDialog({ provider, model, apiKeyStatus, apiKeyDraft, setProvider, setModel, setApiKeyDraft, settingsSaved, onSave, onClose }: { provider: ProviderId; model: string; apiKeyStatus: "connected" | "not-configured" | "checking"; apiKeyDraft: string; setProvider: (value: ProviderId) => void; setModel: (value: string) => void; setApiKeyDraft: (value: string) => void; settingsSaved: boolean; onSave: () => void; onClose: () => void }) {
  const models = providerOptions.find((option) => option.id === provider)?.models ?? [];
  return <ModalShell title="設定" eyebrow="INSTRUMENT / PREFERENCES" onClose={onClose} className="settings-modal"><div className="settings-section"><div className="settings-label"><span className="eyebrow">AI PROVIDER</span><p>この端末から送信する先</p></div><div className="settings-fields"><label>プロバイダー<select value={provider} onChange={(event) => setProvider(event.target.value as ProviderId)}>{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>モデル<select value={model} onChange={(event) => setModel(event.target.value)}>{models.map((option) => <option key={option} value={option}>{option}</option>)}</select></label></div></div><div className="settings-section"><div className="settings-label"><span className="eyebrow">API KEY</span><p>キーはOSの安全な領域に保存</p></div><div className="secret-row"><span className={`secret-status ${apiKeyStatus}`}><span />{apiKeyStatus === "connected" ? "接続済み" : apiKeyStatus === "checking" ? "確認中…" : "未設定"}</span><div className="secret-input"><LockKeyhole size={14} /><input type="password" value={apiKeyDraft} onChange={(event) => setApiKeyDraft(event.target.value)} placeholder="新しいキーを入力" aria-label="APIキー" autoComplete="off" /></div></div></div><div className="settings-section compact"><div className="settings-label"><span className="eyebrow">PRIVACY</span><p>データは明示的に送信するまで端末内</p></div><span className="privacy-chip"><ShieldCheck size={14} />local-first</span></div><div className="settings-actions"><button type="button" className="secondary-action" onClick={onClose}>キャンセル</button><button type="button" className="primary-action" onClick={onSave}>{settingsSaved ? <><Check size={14} />保存しました</> : <><Save size={14} />設定を保存</>}</button></div></ModalShell>;
}

export default App;
