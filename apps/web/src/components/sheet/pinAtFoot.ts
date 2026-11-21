import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePanelDragging } from "../../lib/mapChrome";
import { SETTLE_MS } from "./insets";

/**
 * The row held by its CSS, as the sheet's foot is (sheet/insets'
 * HOLD_AT_EDGE): moved back up by as much as the sheet is slid past where
 * the row would sit on the foot's edge, and never down -- the sheet's
 * offset and the finger's movement against the row's room (--pin-room,
 * usePinAtFoot), on the sheet's own curve and held still under a finger.
 * So it moves with the sheet in the same frame however busy the page is,
 * where moved by script a frame at a time it fell a frame behind the
 * sheet's slide whenever the page was busy: the figures dipped and came
 * back as a pull down settled (the owner's screen recording, 2026-11-16:
 * "the pill takes a second to settle ... It's jumping"). The way an
 * airport card's tabs are held at its foot (CardTabBar's FloatingBar),
 * the owner's pointer ("how does airport card do it?"). The row is marked
 * data-pin-foot so that nothing stops its ease at the pill
 * (sheet/insets' PILL_BODY).
 *
 * On a phone's bottom sheet it is held on the foot's edge at every size,
 * never only "no lower" (--pin-cap, usePinAtFoot, lets the move go down
 * as well as up): the figures go to the bottom and stay there while the
 * rest slides and scrolls under them (the owner, 2026-11-21: "The figures
 * used to be fine before, they would go to bottom and stay there while the
 * rest slides under it"), the floating bar sitting on them (RIDES_ON_PIN).
 * Beside the side panel, which slides nowhere, they sit in their place
 * under the route as before.
 */
export const PIN_AT_FOOT =
  "[transform:translateY(min(var(--pin-cap,0px),calc(var(--pin-room,9999px)-var(--sheet-offset,0px)-var(--sheet-swipe,0px))))] transition-transform duration-(--motion-drawer) ease-(--motion-drawer-ease) group-data-swiping/sheet:transition-none motion-reduce:transition-none";

/**
 * The pinned row's own box (FplRoute's, round the row with PIN_AT_FOOT) on
 * a phone's bottom sheet (Base UI's data-swipe-direction): sticky at the
 * page's foot, so where a route runs on past the page's foot the browser
 * holds the row there as the page scrolls, with the finger, and the row's
 * room (usePinAtFoot) does not change under it. Over the head round it, as
 * the held row is (FplRoute's PINNED, z-30): a sticky box is a stacking
 * context of its own. Beside the side panel the row stays in its place.
 */
export const PIN_STICKS =
  "in-data-[swipe-direction=down]:sticky in-data-[swipe-direction=down]:bottom-0 in-data-[swipe-direction=down]:z-30";

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
 * data-makes-way and drawn with RIDES_ON_PIN) sits on the row, its foot 4
 * points over the row's top, the floating bar's room over the screen's
 * foot (--pin-bar-lift on the bar, barLift), so the figures' values and
 * the bar's buttons are both whole in sight: held on the foot's edge under
 * the bar, the values were behind it, the names past the capsule's ends
 * (the owner's iPhone at his larger text, 2026-11-21); held on the foot's
 * top over the bar instead (fc0b49a47), the figures were no longer at the
 * bottom. And FPL's foot floats over the end of its page, the page running
 * on to the foot's edge with the foot's height as room at its end
 * (--pin-foot-room on the sheet's page, SheetScroller and SheetFoot), so
 * the figures are not cut off all the way up, where the page ended at the
 * foot's top, and the route's last row still scrolls up clear of the bar.
 */
export function usePinAtFoot(ref: RefObject<HTMLElement | null>, foot: string, { on, held }: { on: boolean; held: boolean }) {
  const dragging = usePanelDragging((d) => d.dragging);
  // Whether it is held at rest, for a measure made between this hook's
  // effects (below).
  const heldNow = useRef(held);
  useLayoutEffect(() => {
    heldNow.current = held;
  }, [held]);
  // The room, measured before the page is drawn, so the row is never seen
  // where it would be unheld; again as it is held or let go, when the bar
  // is drawn afresh (FlightFoot puts it away in another box at the pill)
  // and needs its room set again.
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const barOf = () => document.querySelector<HTMLElement>(foot)?.querySelector<HTMLElement>("[data-makes-way]");
    const page = row.closest<HTMLElement>("[data-sheet-scroll]");
    const pageBox = row.closest<HTMLElement>("[data-sheet-page]");
    const letGo = () => {
      for (const name of ["--pin-room", "--pin-cap"]) row.style.removeProperty(name);
      barOf()?.style.removeProperty("--pin-bar-lift");
      pageBox?.style.removeProperty("--pin-foot-room");
    };
    if (!on) {
      letGo();
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
      const sheet = row.closest(SHEET);
      const natural = row.getBoundingClientRect().bottom - moved(row) - moved(sheet);
      const room = restingEdge(edge) - natural;
      setRoom(row, `${room}px`, sheet ? getComputedStyle(sheet).getPropertyValue("--sheet-offset") : "");
      const always = onBottomSheet(sheet);
      setVar(row, "--pin-cap", always ? "9999px" : "0px");
      row.toggleAttribute("data-pinned", pinnedNow(heldNow.current || always, moved(row.closest(SHEET)), room));
      row.toggleAttribute("data-pill", heldNow.current);
      const bar = edge?.querySelector<HTMLElement>("[data-makes-way]");
      if (bar && always) setVar(bar, "--pin-bar-lift", `${barLift(restingBottom(bar), restingEdge(edge) - row.offsetHeight)}px`);
      if (edge && always) {
        if (pageBox) setVar(pageBox, "--pin-foot-room", `${edge.offsetHeight}px`);
      } else pageBox?.style.removeProperty("--pin-foot-room");
    };
    measure();
    const resized = new ResizeObserver(measure);
    if (page) resized.observe(page.firstElementChild ?? page);
    // The row's place moves with the page as it scrolls, so its room does:
    // measured at the top alone, the translation kept as the page scrolled
    // on and carried the figures up through the route, to its middle (the
    // owner's iPhone, 2026-11-21: a long route at full, the strip over the
    // approach's fixes with rows below it). On a phone's bottom sheet the
    // row's box is sticky at the page's foot (PIN_STICKS, on its box), so
    // the browser holds it there as the page scrolls, on the compositor,
    // with the finger, and its room stays the same; measured again once a
    // frame while the page scrolls, for the end of the page, where the
    // route's end comes up off the foot and the sticky box with it. Each
    // value written only as it changes, so a scroll that moves nothing
    // writes nothing: measured and written at each scroll event, the
    // figures were a frame behind the page under the finger (the speed
    // audit of 2026-11-21, finding 9).
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
      letGo();
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
    const check = () => {
      const room = parseFloat(row.style.getPropertyValue("--pin-room")) || 0;
      const sheet = row.closest(SHEET);
      row.toggleAttribute("data-pinned", pinnedNow(held || onBottomSheet(sheet), moved(sheet), room));
      // At the pill, where its face is the figures alone (FplRoute's PINNED).
      row.toggleAttribute("data-pill", held);
    };
    let frame = 0;
    const until = dragging ? Infinity : performance.now() + SETTLE_MS;
    const step = () => {
      check();
      if (performance.now() < until) frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [dragging, held, on, ref]);
}

const SHEET = ".group\\/sheet";

/** A custom property set only where it differs: the same value written
 *  again at every scroll asked the row's style to be worked out again. */
function setVar(el: HTMLElement, name: string, value: string) {
  if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}

/** The sheet's offset at each row's last measure (setRoom). */
const offsetAtMeasure = new WeakMap<HTMLElement, string>();

/**
 * The row's room set, eased only with the sheet. The row's ease is there
 * to follow the sheet's slide (PIN_AT_FOOT); a room changed with the sheet
 * where it was is the route above the row grown or shrunk (its timeline
 * come in, a stop added), and eased it threw the pill's figures down off
 * the screen's foot and slid them back up over the ease's time, as the
 * row's place in the page moved at once and its transform followed slowly
 * (brief-glance.spec: 193 points down at the pill as the route came in, a
 * layout shift of 0.017 under the opening Brief). So that change is set
 * with no ease, committed at once (the computed transform read), and the
 * ease put back for the sheet's next move.
 */
function setRoom(row: HTMLElement, room: string, offset: string) {
  const was = row.style.getPropertyValue("--pin-room");
  const still = offsetAtMeasure.get(row) === offset;
  offsetAtMeasure.set(row, offset);
  if (!was || was === room || !still) {
    row.style.setProperty("--pin-room", room);
    return;
  }
  row.style.transition = "none";
  row.style.setProperty("--pin-room", room);
  void getComputedStyle(row).transform;
  row.style.removeProperty("transition");
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

/** The foot of the foot's floating bar at rest, unlifted (RIDES_ON_PIN),
 *  the foot's and the sheet's transforms taken off as restingEdge does. */
function restingBottom(bar: HTMLElement) {
  const foot = bar.closest('[data-testid="panel-foot"]');
  return bar.getBoundingClientRect().bottom - moved(bar) - moved(foot) - moved(bar.closest(SHEET));
}

/** A phone's bottom sheet (Base UI's data-swipe-direction on its popup),
 *  where the row is held on the foot's edge at every size; not the side
 *  panel, which slides nowhere. */
function onBottomSheet(sheet: Element | null) {
  return sheet instanceof HTMLElement && sheet.dataset.swipeDirection === "down";
}

/** Whether the row is held now: always at the pill and on a phone's
 *  bottom sheet (`held`), else, beside the side panel, once the sheet has
 *  slid further than its room (how far it may slide before the row
 *  reaches the foot's edge). */
export function pinnedNow(held: boolean, slid: number, room: number) {
  return held || slid > room;
}

/** How far the floating bar is lifted so that its foot is 4 points over
 *  the row's top (`rowTop`, held on the foot's edge), the floating bar's
 *  room over the screen's foot (rules.md); none where it is clear already. */
export function barLift(barBottom: number, rowTop: number) {
  return Math.max(0, barBottom + BAR_GAP - rowTop);
}

/** The room between the floating bar and the figures under it, as over
 *  the screen's foot (floatingBarLook's EDGE, rules.md). */
const BAR_GAP = 4;

/**
 * A floating bar in the sheet's foot (FPL's actions, FplTabBar) sitting on
 * the row held at the foot's edge: moved up by --pin-bar-lift (usePinAtFoot)
 * and held there, the foot itself held at the sheet's edge (sheet/insets'
 * HOLD_AT_EDGE), so as the sheet goes down the bar and the figures under it
 * stay while the route slides on under both. Not eased: the lift changes
 * only with the page's layout (the figures' height with the text size),
 * and eased it rose into place under the eye as FPL opened. At the pill it is put
 * away (RISEN_OVER, FlightFoot), the figures the pill's face. It no longer
 * makes way down off the screen's foot: the figures never come down
 * through it, being at the bottom already.
 */
export const RIDES_ON_PIN = "[transform:translateY(calc(-1*var(--pin-bar-lift,0px)))]";
