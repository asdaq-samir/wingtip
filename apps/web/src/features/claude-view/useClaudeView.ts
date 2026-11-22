import { useEffect, useRef, useState } from "react";
import { useApp, type App } from "@modelcontextprotocol/ext-apps/react";
import { answerOf, newer, type Answer, type Change } from "./flightView";
import { joinViews } from "./supersede";

type ToolResult = Awaited<ReturnType<App["callServerTool"]>>;

/** A result's words for the model, its text blocks joined. */
const textOf = (result: Pick<ToolResult, "content">) =>
  (result.content ?? []).flatMap((c) => (c.type === "text" ? [c.text] : [])).join("\n");

/**
 * The connector's live view, its one view model: the MCP App's link to
 * the host (the ext-apps SDK's own useApp), the newest answer of a tool
 * whose result the view draws, a tap's change asked of the connector
 * (callServerTool) and told to the model (updateModelContext), the host's
 * theme, and whether a newer view has the say (supersede).
 */
export function useClaudeView() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [superseded, setSuperseded] = useState(false);
  // The host's context (its theme, the display modes) is read off the
  // app as it is drawn; a change of it draws the view again.
  const [, contextChanged] = useState(0);
  const views = useRef<ReturnType<typeof joinViews> | null>(null);

  const take = (structured: unknown) => {
    const next = answerOf(structured);
    if (!next) return;
    setAnswer((was) => (was && !newer(next.view, was.view) ? was : next));
    views.current?.say({ createdAt: next.view.created_at, seq: next.view.seq });
  };

  const { app, error } = useApp({
    appInfo: { name: "Wingtip", version: "1.0.0" },
    capabilities: { availableDisplayModes: ["inline", "fullscreen"] },
    onAppCreated: (created) => {
      created.ontoolresult = (result) => take(result.structuredContent);
      created.onhostcontextchanged = () => contextChanged((n) => n + 1);
    },
  });

  useEffect(() => {
    const joined = joinViews(crypto.randomUUID(), setSuperseded);
    views.current = joined;
    return () => joined.leave();
  }, []);

  const context = app?.getHostContext();
  const dark = context?.theme === "dark";
  const canExpand = !!context?.availableDisplayModes?.includes("fullscreen") && context?.displayMode !== "fullscreen";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  /** A tap's change: the tool asked with the flight as it is, its answer
   *  drawn, and the model told what the pilot did and the flight now. */
  const change = async (c: Change) => {
    if (!app || !answer || superseded) return;
    setBusy(c.tool);
    setProblem(null);
    try {
      const result = await app.callServerTool({ name: c.tool, arguments: { flight: answer.flight, ...c.args } });
      if (result.isError) {
        setProblem(textOf(result) || "Wingtip could not make that change.");
        return;
      }
      take(result.structuredContent);
      await app.updateModelContext({ content: [{ type: "text", text: `In Wingtip's live view the pilot ${c.said}.\n${textOf(result)}` }] });
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return {
    answer,
    connectFailed: error?.message ?? null,
    busy,
    problem,
    superseded,
    canExpand,
    change,
    open: (url: string) => void app?.openLink({ url }),
    expand: () => void app?.requestDisplayMode({ mode: "fullscreen" }),
  };
}

export type ClaudeViewModel = ReturnType<typeof useClaudeView>;
