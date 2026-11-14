import { expect, type Page } from "@playwright/test";

/**
 * A transition drawn once: the guard for the flicker audit's classes
 * (2026-11-14, FL-1 to FL-23), every frame between a tap and its settling
 * read the way a pilot sees it. The owner's iPhone had shown a card drawn
 * all the way up for a frame before it came down to half (FL-1), a card
 * closed with no slide and the map's buttons thrown off the screen's top
 * (FL-2), and a card swiped past its pill fading out and back (FL-3); each
 * passes a test that looks only at where things end up.
 *
 * The recorder samples every animation frame while armed: each card's
 * drawer (its element, box, opacity, open), the map's buttons, where the
 * map's middle at arming is on the screen, every camera call (the maps
 * the app puts on window.__wingtipMaps in a browser a test drives,
 * GlMapShell), and Chromium's layout shifts.
 */

type Card = { id: number; mine: boolean; top: number; opacity: number; open: boolean };
type Frame = { t: number; cards: Card[]; controlsTop: number | null; anchor: { x: number; y: number } | null };
type Recording = { frames: Frame[]; cameraMoves: { t: number; name: string; who: string }[]; shift: number };

/** Put on the page before it loads (addInitScript), once per page. */
export async function installFrameRecorder(page: Page) {
  await page.addInitScript(() => {
    const ids = new WeakMap<Element, number>();
    let next = 1;
    const idOf = (el: Element) => {
      if (!ids.has(el)) ids.set(el, next++);
      return ids.get(el)!;
    };
    const st = {
      armed: false,
      t0: 0,
      card: "",
      frames: [] as unknown[],
      moves: [] as unknown[],
      shift: 0,
      anchor: null as null | [number, number],
    };
    const w = window as unknown as Record<string, unknown>;
    type GlMap = Record<string, (...a: unknown[]) => unknown>;
    const wrap = (m: GlMap) => {
      for (const name of ["easeTo", "flyTo", "jumpTo", "fitBounds", "setCenter", "setZoom", "panBy", "panTo"]) {
        const orig = m[name]!;
        m[name] = function (this: unknown, ...a: unknown[]) {
          const o = (a[0] ?? {}) as Record<string, unknown>;
          // The map kept still under a new padding (cardRoom's keepStill, a
          // jumpTo with the padding) moves nothing a pilot sees.
          const moves = name !== "jumpTo" || !("padding" in o);
          if (st.armed && moves)
            st.moves.push({ t: performance.now() - st.t0, name, who: (new Error().stack ?? "").split("\n").slice(2, 5).join(" < ") });
          return orig.apply(this, a);
        };
      }
    };
    const maps = (w.__wingtipMaps ??= []) as GlMap[];
    maps.forEach(wrap);
    const push = maps.push.bind(maps);
    maps.push = (...m: GlMap[]) => {
      m.forEach(wrap);
      return push(...m);
    };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[])
          if (st.armed && !e.hadRecentInput) st.shift += e.value;
      }).observe({ type: "layout-shift", buffered: false } as PerformanceObserverInit);
    } catch {
      // WebKit has no layout-shift entries.
    }
    const sample = () => {
      if (st.armed) {
        const map = maps[0] as unknown as { project(p: [number, number]): { x: number; y: number } } | undefined;
        const controls = document.querySelector("[data-map-controls]");
        // In sight only: all the way up they are faded out (index.css).
        const ctl = controls && +getComputedStyle(controls).opacity > 0.05 ? controls.getBoundingClientRect() : undefined;
        st.frames.push({
          t: performance.now() - st.t0,
          cards: [...document.querySelectorAll("[data-sheet-card]")].map((c) => {
            const r = c.getBoundingClientRect();
            return {
              id: idOf(c),
              mine: !!st.card && (c.getAttribute("data-testid") === st.card || !!c.querySelector(`[data-testid="${st.card}"]`)),
              top: Math.round(r.top),
              opacity: +getComputedStyle(c).opacity,
              open: c.hasAttribute("data-open") && !c.hasAttribute("data-ending-style"),
            };
          }),
          // With no box (not drawn) they are not counted either.
          controlsTop: ctl && ctl.height > 0 ? Math.round(ctl.top) : null,
          anchor: map && st.anchor ? map.project(st.anchor) : null,
        });
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    w.__drawnArm = (card: string) => {
      const m = maps[0] as unknown as { getCenter(): { lng: number; lat: number } } | undefined;
      const c = m?.getCenter();
      Object.assign(st, { armed: true, t0: performance.now(), card, frames: [], moves: [], shift: 0, anchor: c ? [c.lng, c.lat] : null });
    };
    w.__drawnStop = () => {
      st.armed = false;
      return { frames: st.frames, cameraMoves: st.moves, shift: st.shift };
    };
  });
}

/**
 * `act` draws what it opens or closes once, at its size, from its first
 * frame: no card drawer shown, hidden and shown again; `card` (a test id on
 * a card's drawer or inside it) drawn by one element from its first frame
 * to its last, never first drawn above where it rests; no open card moving
 * away from where it comes to rest and back, or fading while open; the
 * map's buttons never off the screen's top; at most `maxMoves` camera
 * moves and none undone; a layout shift under `shiftBudget` (Chromium).
 * Arm it after a drag's moves and before its release, so the finger's own
 * movement is not read as a bounce.
 */
export async function expectDrawnOnce(
  page: Page,
  act: () => Promise<unknown>,
  {
    card = "",
    maxMoves = 1,
    shiftBudget = 0.01,
    settleMs = 1500,
  }: { card?: string; maxMoves?: number; shiftBudget?: number; settleMs?: number } = {},
) {
  await page.evaluate((card) => (window as unknown as { __drawnArm(card: string): void }).__drawnArm(card), card);
  await act();
  await page.waitForTimeout(settleMs);
  const rec = (await page.evaluate(() => (window as unknown as { __drawnStop(): unknown }).__drawnStop())) as Recording;
  expect(drawnOnceProblems(rec, { card, maxMoves, shiftBudget }), "drawn once, at its size, from its first frame").toEqual([]);
}

/** What `expectDrawnOnce` finds wrong in a recording, each in words. */
function drawnOnceProblems(rec: Recording, { card, maxMoves, shiftBudget }: { card: string; maxMoves: number; shiftBudget: number }) {
  const f = rec.frames;
  const problems: string[] = [];
  const ids = [...new Set(f.flatMap((x) => x.cards.filter((c) => c.open).map((c) => c.id)))];
  for (const id of ids) {
    const seen = f.map((x) => (x.cards.some((c) => c.id === id && c.open && c.opacity > 0.05) ? "1" : "0")).join("");
    if (/10+1/.test(seen)) problems.push(`card #${id} shown, hidden and shown again: ${seen}`);
    const tops = f.flatMap((x) => x.cards.filter((c) => c.id === id && c.open).map((c) => c.top));
    const end = tops.at(-1)!;
    for (let i = 1; i < tops.length; i++)
      if (Math.abs(tops[i]! - end) > Math.abs(tops[i - 1]! - end) + 4)
        problems.push(`card #${id} moved away from where it rests: ${tops[i - 1]} → ${tops[i]} (rests at ${end})`);
    const ops = f.flatMap((x) => x.cards.filter((c) => c.id === id && c.open).map((c) => c.opacity));
    if (ops.some((o, i) => o < 0.95 && ops.slice(0, i).some((p) => p >= 0.99))) problems.push(`card #${id} faded while open`);
  }
  // A drawer taken off the page while it was still open: gone with no close.
  for (let i = 1; i < f.length; i++)
    for (const c of f[i - 1]!.cards)
      if (c.open && c.opacity > 0.05 && !f[i]!.cards.some((n) => n.id === c.id)) problems.push(`card #${c.id} taken off the page open`);
  if (card) {
    // One of its kind up, then none for two frames or more, then one again:
    // put away and brought back (Fly Here's card, card-once.spec).
    const kind = f.map((x) => (x.cards.some((c) => c.mine && c.open) ? "1" : "0")).join("");
    if (/10{2,}1/.test(kind)) problems.push(`${card} put away and brought back: ${kind}`);
    // Drawn after the act began: one element, however many of its kind
    // were up before it (an airport's card over another's).
    const before = new Set(f[0]?.cards.filter((c) => c.mine && c.open).map((c) => c.id));
    const born = [...new Set(f.flatMap((x) => x.cards.filter((c) => c.mine && c.open && !before.has(c.id)).map((c) => c.id)))];
    if (born.length > 1) problems.push(`${card} drawn by ${born.length} elements (drawn anew)`);
    const first = f.flatMap((x) => x.cards.filter((c) => c.mine && c.open && !before.has(c.id)))[0];
    const last = first && f.at(-1)?.cards.find((c) => c.id === first.id && c.open);
    if (first && last && first.top < last.top - 4) problems.push(`${card} first drawn at ${first.top}, above where it rests (${last.top})`);
  }
  const ctl = f.map((x) => x.controlsTop).filter((t): t is number => t !== null);
  if (ctl.some((t) => t < 0)) problems.push(`the map's buttons went off the screen's top (${Math.min(...ctl)})`);
  if (rec.cameraMoves.length > maxMoves)
    problems.push(
      `${rec.cameraMoves.length} camera moves: ${rec.cameraMoves.map((m) => `${m.name}@${Math.round(m.t)} (${m.who})`).join(", ")}`,
    );
  for (const axis of ["x", "y"] as const) {
    const a = f.flatMap((x) => (x.anchor ? [x.anchor[axis]] : []));
    if (a.length < 2) continue;
    const end = a.at(-1)!;
    const away = a.map((v) => Math.abs(v - end));
    const far = Math.max(...away);
    const at = away.indexOf(far);
    if (far > 24 && away.slice(0, at).some((d) => d < far - 24))
      problems.push(`the map went ${Math.round(far)} px on ${axis} and came back`);
  }
  if (rec.shift > shiftBudget) problems.push(`layout shift ${rec.shift.toFixed(3)}, over the budget of ${shiftBudget}`);
  return problems;
}
