import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { PILL_RADIUS, usePanelDragging, type MapInsets, type PanelState } from "../../lib/mapChrome";
import { prefersReducedMotion } from "../../lib/motion";
import { insetsOf, restingAt, settleSeconds, type Detents } from "./engine";
import { useSheetDrag } from "./useSheetDrag";

/** A settle's curve: iOS's ease-out (feedback: no spring). Its time is
 *  engine's settleSeconds: 0.3 s from the pill to half, one size a throw. */
export const CURVE = "cubic-bezier(0, 0, 0.58, 1)";

/** What a phone's sheet says as it sets off for another size, on its
 *  "sheetturn" event: the room it will leave the map (GlMapShell). */
export interface SheetTurn { insets: MapInsets }

/** The parts held in sight at the sheet's free edge (pin), written to
 *  directly: its head, its body and the body's content, and its foot. */
export interface SheetParts { head: HTMLElement | null; body: HTMLElement | null; inner: HTMLElement | null; foot: HTMLElement | null }

/** Where the map's buttons and its credits ride on the sheet's top
 *  (--sheet-cover, index.css): a rule of their own, set on them alone.
 *  Set on <body>, an inherited property, every change of it restyled the
 *  whole page (177 to 260 ms of a phone's at 4x, 2026-10-28). */
let coverDeclaration: CSSStyleDeclaration | null = null;
let rideDeclaration: CSSStyleDeclaration | null = null;
const coverRule = () => {
  if (!coverDeclaration) {
    const sheet = document.head.appendChild(document.createElement("style")).sheet!;
    sheet.insertRule("[data-map-controls], [data-map-food], .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right {}", 0);
    // The translate they ride the sheet's top by: only those at the foot
    // of the map (the mic's circle is at its top but in flight).
    sheet.insertRule("[data-map-controls], [data-map-food][data-rides], .maplibregl-ctrl-bottom-left, .maplibregl-ctrl-bottom-right {}", 1);
    coverDeclaration = (sheet.cssRules[0] as CSSStyleRule).style;
    rideDeclaration = (sheet.cssRules[1] as CSSStyleRule).style;
  }
  return coverDeclaration;
};
const rideRule = () => {
  coverRule();
  return rideDeclaration!;
};

/**
 * The sheet's motion (MapPanel): placed by one number, its height `h`,
 * written straight to the style (place) -- slid off its edge by full - h,
 * a frame at a time under a finger (useSheetDrag) and as one CSS transition
 * in a settle, started in the same frame the finger lets go, on iOS's
 * ease-out (CURVE) for engine's settleSeconds, never a spring, a throw
 * going one size (engine's restingAt) -- never waiting for React, which
 * hears of the new size afterwards in a transition. What must stay in
 * sight at its free edge is moved back by the same number on those few
 * elements alone (pin), the map's buttons ride its top by a translate of
 * their own (ride), the map is told as it sets off (sheetturn) and the
 * page hears the room it leaves once it has landed (tellInsets). At rest
 * after a commit it is put where its size is, eased there where a detent
 * has moved under it.
 *
 * The size it shows and whether it is on its way stay the sheet's own
 * state (MapPanel), as its measures -- and with them its detents -- are
 * read by them before the motion is given the detents: the size is the
 * page's, or the one it was sent to here (a drag let go, the grabber, a
 * tab's tap), told to the page once it has landed -- told at once, the
 * page drew the whole workspace again for the new size as the sheet set
 * off (140 ms at 4x).
 */
export function useSheetMotion({
  size, setSize, sizeRef, moving, setMoving, movingRef,
  detents, pageState, tellPage, tellInsets, onPhone, wide = false, fromBottom, floating, footShown, safeTop, panel, panelRef, partsRef, pillHeight, atPill, landed,
}: {
  /** The size it shows, and as of now (set as a settle starts). */
  size: PanelState;
  setSize: (size: PanelState) => void;
  sizeRef: RefObject<PanelState>;
  /** On its way: under a finger or easing to a size, and as of now. */
  moving: boolean;
  setMoving: (moving: boolean) => void;
  movingRef: RefObject<boolean>;
  /** Where it comes to rest: the pill, half and all the way up, in px. */
  detents: Detents;
  /** The page's own size, come as a prop: gone to, not told back. */
  pageState: PanelState;
  /** The page told of a size the sheet was sent to here, once it has landed. */
  tellPage: (state: PanelState) => void;
  /** The room it leaves the map, told at rest. */
  tellInsets: (insets: MapInsets) => void;
  onPhone: boolean;
  /** A desktop's wide side panel (useIsDesktop), which covers more of the map. */
  wide?: boolean;
  fromBottom: boolean;
  /** A top sheet floating under the window's top (from `md` up). */
  floating: boolean;
  /** The figures pinned at its foot are shown. */
  footShown: boolean;
  /** The screen's top inset (env(safe-area-inset-top)). */
  safeTop: number;
  /** The sheet's element, as a state for what is set up on it. */
  panel: HTMLElement | null;
  /** The same, for the writes made outside render. */
  panelRef: RefObject<HTMLElement | null>;
  partsRef: RefObject<SheetParts>;
  /** The pill as measured at rest; null till it has been. */
  pillHeight: number | null;
  /** The sheet is the pill (its size the pill's, and it has one). */
  atPill: boolean;
  /** Landed at `target`: the sheet's measures read again at rest. */
  landed: (target: PanelState) => void;
}) {
  // The size asked for here, told to the page once it has landed.
  const asked = useRef<PanelState | null>(null);
  const detentsRef = useRef(detents);

  // What it covers of the map where it comes to rest (insetsOf).
  const insetsFor = useCallback((s: PanelState, d: Detents) => insetsOf(s, d, onPhone, fromBottom, safeTop, wide), [onPhone, fromBottom, safeTop, wide]);

  // The parts held in sight, `off` px in from where the popup's free edge
  // is laid out (its full height less its height now): a bottom sheet's
  // figures and body up by it, the body's content back down; a top
  // sheet's head and body down by it. Transform only, on these alone.
  const pinState = useRef({ fromBottom, footShown, floating });
  useLayoutEffect(() => {
    pinState.current = { fromBottom, footShown, floating };
  }, [fromBottom, footShown, floating]);
  const pin = useCallback((off: number, ease: string) => {
    const { head, body, inner, foot } = partsRef.current;
    const { fromBottom: bottom, footShown: figures } = pinState.current;
    const shift = (px: number) => (Math.abs(px) < 0.25 ? "" : `translate3d(0, ${Math.round(px * 100) / 100}px, 0)`);
    const write = (el: HTMLElement | null, px: number, also = "") => {
      if (!el) return;
      // The figures' growth (--sheet-progress) eased with the sheet too,
      // and a top sheet's body's cut (below) with its move.
      const transition = !ease ? "" : el === foot ? `transform ${ease}, --sheet-progress ${ease}` : `transform ${ease}${also && `, ${also} ${ease}`}`;
      const transform = shift(px);
      // Written only where it changes: each write is a restyle.
      if (el.style.transition !== transition) el.style.transition = transition;
      if (el.style.transform !== transform) el.style.transform = transform;
      // Its own layer while it is moved off its place, so a frame of a
      // drag or a settle moves it rather than painting it again; none
      // where it rests in place (all the way up), the layers cost memory.
      const layer = px || ease ? "transform" : "";
      if (el.style.willChange !== layer) el.style.willChange = layer;
    };
    const up = bottom && figures ? off : 0;
    write(foot, bottom ? -up : 0);
    write(body, bottom ? -up : off, bottom ? "" : "clip-path");
    write(inner, up);
    write(head, bottom ? 0 : off);
    if (body && body.style.overflow !== (up ? "clip" : "")) body.style.overflow = up ? "clip" : "";
    // A top sheet's body, moved down by `off`, runs on under the figures
    // pinned at its foot: cut off at their top, as a bottom sheet's is by
    // its overflow above, or its last rows are drawn over the figures (the
    // owner's screenshot, 2026-11-06: "Add a Stop" over the distance).
    const cut = !bottom && figures && off >= 0.25 ? `inset(0 0 ${Math.round(off * 100) / 100}px 0)` : "";
    if (body && body.style.clipPath !== cut) body.style.clipPath = cut;
  }, [partsRef]);
  // The map's buttons ride on a phone's bottom sheet's top: placed at the
  // height it rests at (--sheet-cover, their `bottom`, set once a move)
  // and moved from there by a translate on the compositor, on the sheet's
  // own curve and time in a settle and a frame at a time under a finger.
  // Their `bottom` written each frame from the main thread lagged the
  // sheet and stepped (the owner, 2026-11-04: "The buttons on top of tabs
  // stutter").
  const coverAt = useRef<number | null>(null);
  const ride = useCallback((h: number, ease: string, from?: number) => {
    const cover = coverRule();
    const rule = rideRule();
    if (!onPhone || !pinState.current.fromBottom) {
      cover.removeProperty("--sheet-cover");
      rule.removeProperty("translate");
      rule.removeProperty("transition");
      coverAt.current = null;
      return;
    }
    if (from !== undefined || coverAt.current === null) {
      // Placed where it is going, shown where it is, then let go to it.
      coverAt.current = Math.round(h);
      rule.setProperty("transition", "opacity 0.2s");
      cover.setProperty("--sheet-cover", `${coverAt.current}px`);
      rule.setProperty("translate", `0 ${Math.round((from ?? h) - h) * -1}px`);
      if (!ease) return;
      const one = document.querySelector<HTMLElement>("[data-map-controls]");
      if (one) void getComputedStyle(one).translate;
      rule.setProperty("transition", `translate ${ease}, opacity 0.2s`);
      rule.setProperty("translate", "0 0px");
      return;
    }
    rule.setProperty("transition", ease ? `translate ${ease}, opacity 0.2s` : "opacity 0.2s");
    rule.setProperty("translate", `0 ${coverAt.current - Math.round(h)}px`);
  }, [onPhone]);

  // The sheet at `h`, written straight to the style: slid off its edge by
  // what is laid out past h (its full height less h), with the parts held
  // in sight and the map's buttons going with it. `ease` for a settle,
  // the transition the browser runs on the compositor; none under a
  // finger. `from` for a settle's start, where the buttons are shown.
  const hRef = useRef(detents[size]);
  const fullRef = useRef(detents.full);
  const place = useCallback((h: number, ease: string, from?: number) => {
    hRef.current = h;
    const panel = panelRef.current;
    if (!panel) return;
    const off = Math.max(0, fullRef.current - h);
    const y = Math.round((pinState.current.fromBottom ? off : -off) * 100) / 100;
    // A floating sheet slid up by `off` would show its glass in the gap
    // over it: cut at its own `off`, where the window's gap ends, its top
    // corners rounded there, eased with the slide.
    const { floating: cutAtTop } = pinState.current;
    const transition = ease ? `transform ${ease}${cutAtTop ? `, clip-path ${ease}` : ""}` : "";
    if (panel.style.transition !== transition) panel.style.transition = transition;
    panel.style.transform = `translate3d(0, ${y}px, 0)`;
    const cut = cutAtTop ? `inset(${Math.round(off * 100) / 100}px 0 0 0 round ${PILL_RADIUS}px)` : "";
    if (panel.style.clipPath !== cut) panel.style.clipPath = cut;
    pin(off, ease);
    ride(h, ease, from);
  }, [pin, ride, panelRef]);
  // Where it is this frame: its last placing, or on its way, from the
  // transform the browser has it at.
  const currentHeight = useCallback(() => {
    const panel = panelRef.current;
    if (!panel || !movingRef.current) return hRef.current;
    const t = getComputedStyle(panel).transform;
    const y = t && t !== "none" ? Math.abs(new DOMMatrix(t).m42) : 0;
    return fullRef.current - y;
  }, [panelRef, movingRef]);

  // To `target`, from where it is, at once: the transition written in this
  // frame -- a finger's release, a tap, a key -- and the map told a frame
  // on and the sheet laid out for the size in a React transition after,
  // so neither's work is in the way of its first frames; the page told
  // once it has landed.
  const landTimer = useRef(0);
  const settle = useCallback((target: PanelState, tell: boolean, now: boolean) => {
    const from = currentHeight();
    const to = detentsRef.current[target];
    const seconds = prefersReducedMotion() || Math.abs(to - from) < 0.5 ? 0 : settleSeconds(to - from);
    window.clearTimeout(landTimer.current);
    if (tell) asked.current = target;
    sizeRef.current = target;
    movingRef.current = true;
    place(from, "");
    if (seconds > 0 && panel) void panel.offsetHeight;
    place(to, seconds > 0 ? `${seconds}s ${CURVE}` : "", from);
    const turn = () => panel?.dispatchEvent(new CustomEvent<SheetTurn>("sheetturn", { bubbles: true, detail: { insets: insetsFor(target, detentsRef.current) } }));
    const lay = () => {
      setSize(target);
      setMoving(true);
    };
    if (now) {
      requestAnimationFrame(turn);
      startTransition(lay);
    } else {
      turn();
      lay();
    }
    landTimer.current = window.setTimeout(() => {
      movingRef.current = false;
      place(detentsRef.current[target], "");
      setMoving(false);
      if (asked.current === target) {
        asked.current = null;
        tellPage(target);
      }
      landed(target);
    }, seconds * 1000 + 40);
  }, [panel, currentHeight, place, insetsFor, tellPage, landed, sizeRef, movingRef, setSize, setMoving]);
  const ask = useCallback((target: PanelState, now = false) => settle(target, true, now), [settle]);
  useEffect(() => () => window.clearTimeout(landTimer.current), []);
  useEffect(() => () => {
    coverRule().removeProperty("--sheet-cover");
    for (const name of ["translate", "transition"]) rideRule().removeProperty(name);
  }, []);

  // At rest after a commit: put where its size is -- eased there where it
  // has grown or shrunk at rest (the route's figures come to the pill,
  // the keyboard up), at once on the first measure. `floating` is a
  // dependency for the clip place writes, which must follow a turn across
  // md even where no detent moves.
  const settledOnce = useRef(false);
  useLayoutEffect(() => {
    fullRef.current = detents.full;
    detentsRef.current = detents;
    if (movingRef.current) return;
    const target = detents[size];
    if (settledOnce.current && Math.abs(hRef.current - target) > 1 && !prefersReducedMotion()) {
      settle(size, false, false);
      return;
    }
    if (pillHeight !== null || !atPill) settledOnce.current = true;
    place(target, "");
  }, [detents, size, pillHeight, atPill, footShown, fromBottom, floating, place, settle, movingRef]);
  // The page's own size, come as a prop: gone to.
  useEffect(() => {
    if (pageState !== sizeRef.current) settle(pageState, false, false);
  }, [pageState, settle, sizeRef]);
  // What the workspace draws for a sheet on the move (FPL's strips).
  useEffect(() => {
    const frame = requestAnimationFrame(() => usePanelDragging.setState({ dragging: moving }));
    return () => cancelAnimationFrame(frame);
  }, [moving]);
  // The room it leaves the map, told once at rest (the turn's event said
  // it as the sheet set off).
  const insetsNow = useMemo(() => insetsFor(size, detents), [insetsFor, size, detents]);
  useEffect(() => {
    if (!moving) tellInsets(insetsNow);
  }, [moving, insetsNow, tellInsets]);

  // A drag: from the grabber, the first row, the head and the pill's foot
  // by pointer; from the body by touch where its content is not
  // scrolling (useSheetDrag). It follows the finger a frame at a time and
  // lets go to the detent it was heading for, one size at most.
  const { startDrag, swallow, body: dragBody } = useSheetDrag({
    detents, fromBottom,
    height: currentHeight,
    began: () => {
      const h = currentHeight();
      window.clearTimeout(landTimer.current);
      movingRef.current = true;
      place(h, "");
      setMoving(true);
    },
    place: h => place(h, ""),
    release: (h, speed) => settle(restingAt(detentsRef.current, h, speed), true, true),
  });
  return { ask, startDrag, swallow, dragBody };
}
