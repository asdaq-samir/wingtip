import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { test as setup } from "@playwright/test";
import { DEVELOPER, DEVELOPER_STATE, blankHomeBase, signInByApi } from "./emailSignIn";
import { noTips } from "./helpers";

/** What `fill` leaves in a page's localStorage, run against an empty one:
 *  the suite's starting storage written by the same helpers a spec runs in
 *  its page, so there is one home for each key. */
function storageAfter(fill: () => void): { name: string; value: string }[] {
  const kept = new Map<string, string>();
  const storage = { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, String(v)) };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
  try {
    fill();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
  return [...kept].map(([name, value]) => ({ name, value }));
}

/**
 * The session the rest of the suite runs as (playwright.config.ts's
 * "setup" project): developer@example.com signed in by its emailed link,
 * by API, with no page. Signed in from the page it waited on the map and
 * the console's sheet to settle, which on a loaded runner ran out and
 * held every project of its shard (CI audit 2026-11-23, M6); the sign-in
 * as a pilot makes it, and the developer's landing in dev mode, are
 * signin.spec's.
 */
setup("the developer's session, signed in by its emailed link", async ({ request, baseURL }) => {
  await signInByApi(request, DEVELOPER);
  // No home airport, as a new account has none. The developer's account
  // lives on in the stack's Postgres from run to run, and a spec of old
  // set Home on it (KMSN), which the page then brought to every spec's
  // device (lib/homeAirport). A spec that wants Home keeps its own to its
  // page (oneSearch's ownHomeBase).
  await blankHomeBase(request);
  const state = await request.storageState();
  const localStorage = storageAfter(() => {
    // The first flight's welcome and FPL tip (lib/firstRunTips) seen: over
    // the map they take the click a spec meant for it. first-flight.spec
    // offers them afresh.
    noTips();
    // FPL's fields opened at first (ProceduresRoute's fieldsOpenAtFirst):
    // the specs work on their runways and procedures; route-fields.spec
    // folds them as a pilot sees them.
    globalThis.localStorage.setItem("wingtip.fieldsOpen", "1");
  });
  // No airplane picked, as a pilot starts (the owner, 2026-11-09: nothing
  // assumes one): a spec that reads an airplane's times, fuel or figures
  // picks it itself (helpers' pickAirplane).
  mkdirSync(dirname(DEVELOPER_STATE), { recursive: true });
  writeFileSync(DEVELOPER_STATE, JSON.stringify({ ...state, origins: [{ origin: new URL(baseURL!).origin, localStorage }] }));
});
