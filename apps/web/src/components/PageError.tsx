import { Component, useEffect, type ReactNode } from "react";
import { cn } from "cn";
import { Button } from "./ui/button";
import { reportOf, sendReport } from "../lib/errorReports";
import { TEXT } from "../lib/text";
import { useChunkFailure } from "../lib/chunkRecovery";

/** The words for what it was (lib/chunkRecovery), where it stayed. */
const WORDS = {
  newer: { title: "A newer version is ready", line: "Reload to use it." },
  offline: { title: "No connection", line: "Part of the app is not on this device yet. Reload once the connection is back." },
  failed: { title: "Part of the app didn’t load", line: "Check the connection, then reload." },
} as const;

/**
 * The page when a part of it could not be drawn -- most often a chunk the
 * phone could not fetch, after a deploy or with no signal (main.tsx's
 * vite:preloadError reloads once first where a newer build is served,
 * lib/chunkRecovery) -- said plainly with which it was and the way on,
 * where React's blank page took the map's place. Reported as a render
 * error is.
 */
function PageError({ error }: { error: unknown }) {
  const failure = useChunkFailure((s) => s.failure);
  const words = WORDS[failure ?? (globalThis.navigator?.onLine === false ? "offline" : "failed")];
  useEffect(() => {
    sendReport(reportOf("render", error));
  }, [error]);
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-6 text-center" data-testid="page-error">
      <h1 className={cn("font-semibold text-foreground", TEXT.card)}>{words.title}</h1>
      <p className={cn("max-w-sm text-muted-foreground", TEXT.detail)}>{words.line}</p>
      <Button type="button" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </main>
  );
}

/**
 * A page's error boundary, PageError in its place when it throws. React's
 * own class API (getDerivedStateFromError): a boundary has no hook form.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { error: unknown; failed: boolean }> {
  state = { error: null as unknown, failed: false };

  static getDerivedStateFromError(error: unknown) {
    return { error, failed: true };
  }

  render() {
    return this.state.failed ? <PageError error={this.state.error} /> : this.props.children;
  }
}
