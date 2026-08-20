import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App, { scopeCanvasElements, toPersistedSnapshot } from "./App";

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: () => <div data-testid="excalidraw-canvas" aria-label="Excalidraw canvas" />,
  exportToBlob: vi.fn(),
  exportToSvg: vi.fn(),
  serializeAsJSON: vi.fn(() => "{}"),
}));

describe("AI Whiteboard renderer", () => {
  it("renders a cohesive instrument rail, board, prompt and context lens", () => {
    const markup = renderToString(<App />);

    expect(markup).toContain("AI Whiteboard");
    expect(markup).toContain("AIへのプロンプト");
    expect(markup).toContain("コンテキストレンズ");
    expect(markup).toContain("Objects");
  });

  it("renders the local-first session browser affordances", () => {
    const markup = renderToString(<App />);

    expect(markup).toContain("摩擦の実験｜中2 STEM");
    expect(markup).toContain("端末内に保存");
    expect(markup).toContain("自動保存済み");
  });

  it("never expands an empty selection to the full canvas", () => {
    const elements = [{ id: "private" }, { id: "share" }];
    expect(scopeCanvasElements(elements, [], true)).toEqual([]);
    expect(scopeCanvasElements(elements, ["share"], true)).toEqual([{ id: "share" }]);
  });

  it("removes non-JSON Excalidraw collaborators before persistence", () => {
    const snapshot = toPersistedSnapshot({
      elements: [],
      appState: { collaborators: new Map([["person", { name: "Family" }]]), zoom: { value: 1 } },
      files: {},
    });
    expect(snapshot.appState).not.toHaveProperty("collaborators");
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });

});
