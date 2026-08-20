import type { AiWhiteboardApi } from "./types";

declare global {
  interface Window {
    aiWhiteboard?: AiWhiteboardApi;
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onend: (() => void) | null;
    onerror: ((event: { error?: string }) => void) | null;
    onresult: ((event: {
      resultIndex: number;
      results: ArrayLike<{
        isFinal: boolean;
        0: { transcript: string };
      }>;
    }) => void) | null;
  }
}

export {};
