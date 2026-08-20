import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("AI Whiteboard root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
