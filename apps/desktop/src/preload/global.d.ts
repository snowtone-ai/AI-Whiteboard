import type { WhiteboardApi } from '../main/contracts';

declare global {
  interface Window {
    readonly whiteboard: WhiteboardApi;
  }
}

export {};
