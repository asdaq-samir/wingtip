/**
 * Runs `run` once the page is in sight and the phone online, `afterMs`
 * after: a query whose connection dropped, asked again by itself
 * (lib/queryClient).
 */
export function whenBack(
  run: () => void,
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> = document,
  afterMs = 1000,
) {
  const ready = () => doc.visibilityState === "visible" && globalThis.navigator?.onLine !== false;
  const done = () => {
    doc.removeEventListener("visibilitychange", go);
    globalThis.removeEventListener?.("online", go);
  };
  function go() {
    if (!ready()) return;
    done();
    setTimeout(run, afterMs);
  }
  doc.addEventListener("visibilitychange", go);
  globalThis.addEventListener?.("online", go);
  go();
}
