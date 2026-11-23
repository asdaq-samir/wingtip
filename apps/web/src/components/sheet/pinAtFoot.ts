import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePanelDragging } from "../../lib/mapChrome";
import { prefersReducedMotion } from "../../lib/motion";
import { pinScaleAt } from "../../lib/text";
import { SETTLE_MS, SHEET_SLIDE, shownPx } from "./insets";
import { followSettle } from "./pinFollow";
import { SWIPE_READER } from "./sheetFollow";

/**
 * The row held by its CSS, as the sheet's foot is (sheet/insets'
 * HOLD_AT_EDGE): moved back up by as much as the sheet is slid past where
 * the row would sit on the foot's edge, and never down -- the sheet's
 * offset and the finger's movement against the row's room (--pin-room,
 * usePinAtFoot), exact under a finger, the finger's movement handed to it
 * alone (SWIPE_READER, sheet/sheetFollow). Through a settle it is not
 * eased by a transition, which went straight from end to end at a fixed
 * share of the sheet's speed and slid the figures over the route above
 * (the gestures audit of 2026-11-23, H3), but by an animation on the
 * sheet's own curve that keeps the CSS's path, kink and all
 * (sheet/pinFollow). So it moves with the sheet in the same frame however
 * busy the page is, where moved by script a frame at a time it fell a
 * frame behind the sheet's slide whenever the page was busy: the figures
 * dipped and came back as a pull down settled (the owner's screen
 * recording, 2026-11-16: "the pill takes a second to settle ... It's
 * jumping"). The way an
 * airport card's tabs are held at its foot (CardTabBar's FloatingBar),
 * the owner's pointer ("how does airport card do it?"). The row is marked
 * data-pin-foot, where the browser tests find it.
 *
 * Of two places, the higher on the screen: where it rests on the sheet
 * (its place under the route, no lower than the foot's top), which goes
 * down with the sheet as a finger pulls it -- no --sheet-swipe in it --
 * and the foot's edge, held still there (with it). So pulled toward the
 * pill the figures go down with the plan, under the floating bar, and
 * stay on the screen's foot once there, frame by frame on Base UI's own
 * offsets, where held on the foot's top while the sheet went they waited
 * for the sheet's top to reach them and then jumped (the owner,
 * 2026-11-22: "doesn't slide down with the plan, waits until it touches
 * the grabber on top").
 *
 * Never lower than its own place: where the plan is short the figures sit
 * right under it, and are held on the foot only once the plan reaches
 * the foot (the owner's iPhone, 2026-11-23: a short route at half, an
 * empty band of 40 points between the route and the figures held down on
 * the foot, where --pin-cap had held them down as well as up since
 * 2026-11-22).
 *
 * Off the pill its lowest place is the foot's top, not its edge
 * (--pin-lift, the foot's height; usePinAtFoot), so the figures sit over
 * the floating bar, never under it: a route longer than the sheet held
 * them on the foot's edge behind FPL's actions, their names showing past
 * the capsule's ends and their values not at all, at half and all the way
 * up, where the page's scroller ends at the foot's top and cut them off
 * whole (the owner's iPhone at his larger text, 2026-11-21). The lift
 * goes in the last stretch of a slide to the pill (--pin-pill, the
 * sheet's offset there), as the bar makes way, so the figures come down
 * onto the foot's edge there as before.
 */
export const PIN_AT_FOOT = `[transform:translateY(min(0px,calc(var(--pin-room,9999px)-var(--sheet-offset,0px)-min(var(--pin-lift,0px),max(0px,calc(var(--pin-pill,0px)-var(--sheet-offset,0px)-var(--sheet-swipe,0px))))),calc(var(--pin-room,9999px)-var(--sheet-offset,0px)-var(--sheet-swipe,0px))))] ${SWIPE_READER}`;

/**
 * A row of a sheet's head that is its pill (PIN_AT_FOOT on it): held on
 * the edge of the sheet's foot (`foot`, a selector) while the sheet rests
 * at the pill (`held`), and as the sheet goes down riding with it to there
 * and staying while the rest of the sheet slides on down under it; the
 * other way, waiting there as the sheet comes up until its own place
 * reaches it (the owner, 2026-11-16, of FPL's figures: "calculations
 * should sit at the bottom after sliding and then just stay there while
 * the fpl slides down"). One copy at every size, so nothing is handed over
 * at the pill: every flicker at the end of a pull down came from handing
 * FPL's figures from a second copy at the pill to this one (the owner,
 * 2026-11-16: "Maybe having common code will remove the bugs from fpl?").
 *
 * The script only measures: the row's room, how far the sheet may slide
 * before the row reaches the foot's resting edge, again whenever the
 * page's layout changes (`on` false: none, not this sheet's way now); and
 * whether the row is held (data-pinned, for its own look: in sight at the
 * pill, where the rest of the head is not, and its backing, FplRoute's
 * PINNED), at the pill and, a frame at a time, while a finger has the
 * sheet or it settles.
 *
 * A floating bar in the foot (FPL's actions, FplTabBar, marked
 * data-makes-way and drawn with MAKES_WAY) is never an edge the row stops
 * at: off the pill the row sits in its place under the route and passes
 * under the bar as anything under a floating bar does, and the bar makes
 * way as the sheet goes down so the row is in sight on its way to the
 * foot (the owner, 2026-11-18: "the main issue is tab bar is not allowing
 * the figures to go past it"). Held over the bar's top, the figures
 * covered a short panel's route (an iPhone in landscape at half: the
 * departure's row alone in sight, the stops' row cut in half); held on
 * the foot's edge under a bar that stayed, a slow pull down from half hid
 * them under the bar and its fade. The script measures the bar's room
 * too (--pin-bar-room on the bar, barRoom); the bar's own CSS does the
 * rest.
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, foot: string, { on, held }: { on: boolean; held: boolean }) {
  const dragging = usePanelDragging((d) => d.dragging);
  // Whether it is held at rest, for a measure made between this hook's
  // effects (below).
  const heldNow = useRef(held);
  useLayoutEffect(() => {
    heldNow.current = held;
  }, [held]);
  // Through each settle, its own animation on the sheet's curve (sheet/pinFollow).
  useEffect(() => {
    const row = ref.current;
    if (!row || !on) return;
    return followSettle(row);
  }, [on, ref]);
  // The room, measured before the page is drawn, so the row is never seen
  // where it would be unheld; again as it is held or let go, when the bar
  // is drawn afresh (FlightFoot puts it away in another box at the pill)
  // and needs its room set again.
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const barOf = () => document.querySelector<HTMLElement>(foot)?.querySelector<HTMLElement>("[data-makes-way]");
    if (!on) {
      for (const name of ["--pin-room", "--pin-lift", "--pin-pill", "--pin-half", "--pin-p", "--pin-s", "--pin-h"])
        row.style.removeProperty(name);
      barOf()?.style.removeProperty("--pin-bar-room");
      return;
    }
    const measure = () => {
      const edge = document.querySelector<HTMLElement>(foot);
      // Not while the foot is put away (a card up over the sheet, MapPanel's
      // footShown): its edge read as the screen's top, the room went far
      // below nothing, and the row was held as the pill -- larger, on the
      // sheet's colour, over the departure -- until the next drag, the
      // owner's "When I tap the fuel and close it, the strip becomes bigger
      // hiding the departure" (2026-11-17). Measured again as it comes back.
      if (edge && edge.getClientRects().length === 0) return;
      // Every read before the first write: a custom property written on
      // the row and then a transform or a rect read made the browser work
      // out the style and layout again within the frame, up to twice a
      // scroll frame (react-perf L3). The row's own variables move only the
      // row, so the sheet's and the bar's places read first are the same.
      const sheet = row.closest(SHEET);
      const slid = moved(sheet);
      const box = row.getBoundingClientRect();
      const natural = box.bottom - moved(row) - slid;
      const room = restingEdge(edge) - natural;
      const lift = liftOf(edge, sheet);
      const bar = edge?.querySelector<HTMLElement>("[data-makes-way]");
      const barTop = bar ? restingTop(bar) : 0;
      setRoom(row, `${room}px`);
      setVar(row, "--pin-lift", `${lift.lift}px`);
      setVar(row, "--pin-pill", `${lift.pill}px`);
      setVar(row, "--pin-half", `${lift.half}px`);
      // Its height laid out, for its backing to grow with its scale (FplActions' PINNED).
      setVar(row, "--pin-h", `${box.height}px`);
      growTo(row, growAt(slid, lift.half, lift.pill, heldNow.current), true);
      row.toggleAttribute("data-pinned", pinnedNow(heldNow.current, slid, room, liftAt(slid, lift.lift, lift.pill)));
      // At the pill, where its face is the figures alone (FplRoute's PINNED).
      row.toggleAttribute("data-pill", heldNow.current);
      if (bar) setVar(bar, "--pin-bar-room", `${barRoom(barTop, natural)}px`);
    };
    measure();
    const resized = new ResizeObserver(measure);
    const page = row.closest("[data-sheet-scroll]");
    if (page) resized.observe(page.firstElementChild ?? page);
    // Its own size too, set as the sheet rests (growTo), the room measured with it.
    resized.observe(row);
    // The row's place moves with the page as it scrolls, so its room does:
    // measured at the top alone, the translation kept as the page scrolled
    // on and carried the figures up through the route, to its middle (the
    // owner's iPhone, 2026-11-21: a long route at full, the strip over the
    // approach's fixes with rows below it). Measured again once a frame
    // while the page scrolls, each value written only as it changes
    // (setVar): measured and written at each scroll event, the figures were
    // a frame behind the page under the finger (the speed audit of
    // 2026-11-21, finding 9). Not sticky (perf-fix's PIN_STICKS, undone
    // 2026-11-22): a sticky box held the figures at the page's foot from
    // the first move, over the route's last rows, where they are to sit
    // under the route and go down with the sheet until they meet the foot
    // (the owner: "Figures are overlapping the grouped box at the bottom
    // and doesn't slide down with the plan, waits until it touches the
    // grabber on top").
    let scrolled = 0;
    const onScroll = () => {
      if (!scrolled) scrolled = requestAnimationFrame(() => ((scrolled = 0), measure()));
    };
    page?.addEventListener("scroll", onScroll, { passive: true });
    const edge = document.querySelector<HTMLElement>(foot);
    if (edge) resized.observe(edge);
    addEventListener("resize", measure);
    return () => {
      resized.disconnect();
      cancelAnimationFrame(scrolled);
      page?.removeEventListener("scroll", onScroll);
      removeEventListener("resize", measure);
      barOf()?.style.removeProperty("--pin-bar-room");
    };
  }, [on, foot, ref, held]);
  // Whether it is held now.
  useEffect(() => {
    const row = ref.current;
    if (!row) return;
    if (!on) {
      row.removeAttribute("data-pinned");
      row.removeAttribute("data-pill");
      return;
    }
    // `slid` read before any write here, so nothing written is read back
    // within the frame (the animation audit of 2026-11-23, M2).
    const check = (slid: number, settled: boolean) => {
      const px = (name: string) => parseFloat(row.style.getPropertyValue(name)) || 0;
      row.toggleAttribute("data-pinned", pinnedNow(held, slid, px("--pin-room"), liftAt(slid, px("--pin-lift"), px("--pin-pill"))));
      row.toggleAttribute("data-pill", held);
      // The figures' size, followed a frame at a time as the sheet goes
      // (FIXED by the pill, thin above it): by a scale while it moves, laid
      // out once it rests (growTo).
      growTo(row, growAt(slid, px("--pin-half"), px("--pin-pill"), held), settled);
    };
    // A frame at a time for the settle's time, and on while the sheet is
    // still moving after it, and once more as its slide ends: on a slow
    // runner the slide began late and ended after SETTLE_MS, the last frame
    // read the sheet short of half, and the strip rested there part grown
    // (--pin-p 0.2, 35 points tall at half where it is 32; CI's
    // fpl-strip-foot, run 45107108914).
    const sheet = row.closest(SHEET);
    let frame = 0;
    let was = Number.NaN;
    const until = dragging ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      const slid = moved(sheet);
      const moving = slid !== was;
      was = slid;
      const going = performance.now() < until || moving;
      check(slid, !going);
      if (going) frame = requestAnimationFrame(step);
    };
    step();
    const ended = () => check(moved(sheet), true);
    sheet?.addEventListener("transitionend", ended);
    return () => {
      cancelAnimationFrame(frame);
      sheet?.removeEventListener("transitionend", ended);
    };
  }, [dragging, held, on, ref]);
}

const SHEET = ".group\\/sheet";

/** A custom property set only where it differs: the same value written
 *  again at every scroll asked the row's style to be worked out again. */
function setVar(el: HTMLElement, name: string, value: string) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

/**
 * The figures grown to `p` (growAt): laid out at that size once the sheet
 * rests (`settled`), the scale back to none; while it moves, drawn at it by
 * a scale of their laid-out size (lib/text's PIN_FIGURE cell), which
 * changes no layout, where their font size grown each frame laid the strip
 * out twice a finger move and the map's slide read it straight after (the
 * animation audit of 2026-11-23, M2). Not laid out yet, laid out at once.
 */
function growTo(row: HTMLElement, p: number, settled: boolean) {
  const laid = parseFloat(row.style.getPropertyValue("--pin-p"));
  if (settled || Number.isNaN(laid)) {
    setVar(row, "--pin-p", `${p}`);
    setVar(row, "--pin-s", "1");
    return;
  }
  setVar(row, "--pin-s", `${pinScaleAt(p, laid)}`);
}

/**
 * The row's room set. Set at once: nothing eases the row's transform but
 * its settle's own animation (sheet/pinFollow), so a room changed with the
 * sheet where it was -- the route above the row grown or shrunk, its
 * timeline come in, a stop added -- moves the row at once with its place
 * in the page, where an eased room threw the pill's figures down off the
 * screen's foot and slid them back (brief-glance.spec: 193 points down at
 * the pill as the route came in), and the trick that set it with no ease
 * forced a style and layout twice a frame through a pull (the motion
 * review of 2026-11-22).
 */
function setRoom(row: HTMLElement, room: string) {
  setVar(row, "--pin-room", room);
}

/** How far `el` is moved down by its own transform now. */
function moved(el: Element | null) {
  // Nothing moved where the page has no layout to read (jsdom, the unit
  // tests' page, has no DOMMatrixReadOnly: the planner's first draw threw).
  if (!el || typeof DOMMatrixReadOnly === "undefined") return 0;
  return new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
}

/** Where the foot's edge is once the sheet is at rest: its place now with
 *  its own and the sheet's transforms taken off, which cancel at rest (the
 *  foot is moved back by the sheet's offset, sheet/insets' HOLD_AT_EDGE),
 *  so one place at every moment of a drag and a settle. */
function restingEdge(foot: HTMLElement | null) {
  if (!foot) return window.innerHeight;
  return foot.getBoundingClientRect().bottom - moved(foot) - moved(foot.closest(SHEET));
}

/** The top of the foot's floating bar at rest, its own way made (MAKES_WAY),
 *  the foot's and the sheet's transforms taken off as restingEdge does. */
function restingTop(bar: HTMLElement) {
  const foot = bar.closest('[data-testid="panel-foot"]');
  return bar.getBoundingClientRect().top - moved(bar) - moved(foot) - moved(bar.closest(SHEET));
}

/** Whether the row is held now: always at the pill, else once the sheet
 *  has slid further than its room (how far it may slide before the row
 *  reaches the foot's edge) less the lift it has there (liftAt). */
export function pinnedNow(held: boolean, slid: number, room: number, lift = 0) {
  return held || slid + lift > room;
}

/** How far over the foot's edge the row is held with the sheet slid
 *  `slid`: the whole lift (the foot's height, so it sits on the foot's
 *  top, over the floating bar) until the sheet is within that of the pill
 *  (`pill`, its offset there), then less, to none at the pill, where the
 *  row is the pill's face on the foot's edge. PIN_AT_FOOT's CSS, as a sum. */
export function liftAt(slid: number, lift: number, pill: number) {
  return Math.min(lift, Math.max(0, pill - slid));
}

/**
 * How far the figures have grown from their thin line (0, at half and
 * all the way up) to their full size (1, as the pill), by how far the
 * sheet has slid between half (`half`, its offset there) and the pill
 * (`pill`), measured from its rect a frame at a time while a finger has
 * it or it settles, so the strip follows the finger (the owner,
 * 2026-11-22: "It should follow finger to look natural"). With Reduce
 * Motion, the end size only: thin until the sheet is at the pill (`held`),
 * asked of lib/motion's one kept query, as it is asked every frame (a
 * matchMedia made afresh at each was the cost lib/motion measured).
 */
export function growAt(slid: number, half: number, pill: number, held: boolean, reduced = prefersReducedMotion()) {
  if (reduced || pill <= half) return held ? 1 : 0;
  return Math.round(Math.min(1, Math.max(0, (slid - half) / (pill - half))) * 1000) / 1000;
}

/** The foot's height, the row's lift off its edge, and the sheet's offset
 *  at the pill: a phone's bottom sheet only (Base UI's data-swipe-direction
 *  on its popup), none beside the side panel, which slides nowhere. */
function liftOf(foot: HTMLElement | null, sheet: Element | null) {
  if (!foot || !(sheet instanceof HTMLElement) || sheet.dataset.swipeDirection !== "down") return { lift: 0, pill: 0, half: 0 };
  const h = sheet.offsetHeight;
  return { lift: foot.offsetHeight, pill: h - shownPx("peek", true, h), half: h - shownPx("half", true, h) };
}

/** How far the sheet may slide down before the row's foot reaches the
 *  floating bar's top (both at rest): past that, the bar makes way
 *  (MAKES_WAY). Below nothing where the row already sits under the bar. */
export function barRoom(barTop: number, rowBottom: number) {
  return barTop - rowBottom;
}

/**
 * A floating bar in the sheet's foot (FPL's actions, FplTabBar) making way
 * for the row held at the foot as the sheet goes down: moved down, off the
 * screen's foot, by as far as the sheet has slid past where the row would
 * meet its top (--pin-bar-room, usePinAtFoot), and never by more than the
 * finger has pulled the sheet down from where it rested (--sheet-swipe),
 * so a row already under the bar at rest (a short panel's figures, waiting
 * at the foot) comes out from under it as the pull begins, and the bar is
 * where it was at rest at every size, and back as the sheet settles there
 * again. Base UI's own offsets in CSS, on its curve, held still under a
 * finger, as PIN_AT_FOOT is: nothing mirrored, nothing a frame behind. A
 * drag up (the swipe below nothing) never moves it. At the pill it is put
 * away besides (RISEN_OVER, FlightFoot), so a settle to the pill (the
 * popup's data-panel "peek") takes it straight to its rest unseen: eased,
 * it ran 243 px back up against the sheet's way, over the map, through
 * every drop to the pill (the animation audit of 2026-11-23, L2).
 */
export const MAKES_WAY = `[transform:translateY(max(0px,min(var(--sheet-swipe,0px),calc(var(--sheet-offset,0px)+var(--sheet-swipe,0px)-var(--pin-bar-room,9999px)))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none group-data-[panel=peek]/sheet:transition-none ${SWIPE_READER} ${SHEET_SLIDE}`;
