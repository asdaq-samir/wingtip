import React from "react";
import ReactDOM from "react-dom/client";
import { ClaudeView } from "./features/claude-view";
import "./index.css";

// The connector's live view, its own page (claude-view.html): no router,
// no engine, no service worker, no fonts of its own -- its host's sandbox
// loads none of them -- only the view and the app's styles.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ClaudeView />
  </React.StrictMode>,
);
