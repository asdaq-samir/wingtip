import { createContext, useContext, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { mergeProps } from "@base-ui/react/merge-props";
import { createPortal } from "react-dom";
import { ChevronRight, GripVertical } from "lucide-react";
import { cn } from "cn";
import { useDraggingKind, usePointDrag } from "../pointDrag";
import CardIdent from "../CardIdent";
import { CardMark, CardThread, EmptyMark } from "../routeCard";
import { CARD_GAP, POINT_CARD, ROUTE_LINE } from "../routeListStyle";
import { TEXT } from "../../../../lib/text";
import type { Detour, LegHold } from "../../../../lib/api/types";
import { holdWords, type Hold } from "../../lib/routeHolds";
import { pointName } from "../../../../lib/identSchema";

// The rows down FPL's route list (ProceduresRoute) other than a field's
// block (FieldStep): a point flown over, a hold, a stop being added, and
// the drag that moves the typed points.

/**
 * A stop being added, In the Plan: an empty card at its place, its text
 * box ready to type in (CardIdent), on the course's line, at the owner's
 * ask (2026-11-05: "when adding a stop just add a stop with the editable
 * card"). Return or leaving it puts the stop in; left empty, it goes.
 */
export function NewStopCard({
  via,
  onCommit,
  onCancel,
}: {
  via: Detour[] | null;
  onCommit: (ident: string) => void;
  onCancel: () => void;
}) {
  return (
    <li className={cn("relative", POINT_CARD, "isolate", CARD_GAP)} data-testid="route-new-stop">
      <CardThread first={false} last={false} />
      <div className="flex items-center gap-2.5">
        <span className="grid w-7 shrink-0 place-items-center" aria-hidden="true">
          {/* An airport's mark in the marks' grey disc, faded till its ident
              is in, at the owner's ask (2026-11-05: "The stop icons can be
              airport like when empty"); the disc the marks' 36, so the line
              meets it at its left as theirs. */}
          <CardMark>
            <EmptyMark />
          </CardMark>
        </span>
        <div className="flex min-w-0 flex-1 pr-1.5">
          <CardIdent
            value=""
            label="New stop"
            placeholder="Airport or waypoint"
            testId="route-new-stop-ident"
            focused
            wide
            fixes
            onCommit={onCommit}
            onEmpty={onCancel}
          />
        </div>
      </div>
      {/* Fly via's ways round, on the card between the points they go
          between, at the owner's ask (2026-11-05: "Fly via suggestions
          should come between the cards right?"): each a tap that puts it
          in, as the box's Suggested were; held off the text box's blur,
          which would take the empty card away before the tap. */}
      {via && via.length > 0 && (
        <ul className="mt-2 pl-9.5" aria-label="Suggested" data-testid="route-new-stop-via">
          {via.map((d) => (
            <li key={d.ident}>
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onCommit(d.ident)}
                data-testid="picker-suggestion"
                className="flex min-h-11 w-full items-center gap-2 pr-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-semibold text-tint", TEXT.row)}>{d.ident}</span>
                  <span className={cn("block truncate text-muted-foreground", TEXT.note)}>
                    {[d.kind, d.description].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={cn("shrink-0 text-muted-foreground tabular-nums", TEXT.detail)}>+{Math.round(d.added_nm)} nm</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * A hold the pilot put at a point (HoldSheet), its own row after it: a
 * racetrack on the route's line, what it is ("Right turns · 270° inbound
 * · 1 min legs · 2 turns"), the entry the planner worked out from the
 * course flown to it (AIM 5-3-8) and the time it adds; a tap changes it.
 */
export function HoldRow({ hold, flown, last, onOpen }: { hold: Hold; flown: LegHold | null; last: boolean; onOpen: () => void }) {
  return (
    <li className="relative flex gap-2.5" data-testid="route-hold" data-fix={hold.fix}>
      {!last && <span aria-hidden="true" className="absolute top-0 bottom-0 left-[calc(0.875rem-1px)] w-0.5" style={ROUTE_LINE} />}
      <div className="relative flex w-7 shrink-0 justify-center pt-1.5" aria-hidden="true">
        <svg viewBox="0 0 28 16" className="h-4 w-7 rounded-full bg-background">
          <rect x="2" y="2" width="24" height="12" rx="6" fill="none" className="stroke-course" strokeWidth="2.5" strokeDasharray="4 3" />
        </svg>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Hold at ${pointName(hold.fix)}: ${holdWords(hold)}${flown ? `, ${flown.entry} entry, ${Math.round(flown.minutes)} minutes more` : ""}: change`}
        className="mb-4 flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl bg-tint/8 px-2.5 py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={cn("font-semibold", TEXT.row)}>Hold</span>
          <span className={cn("text-muted-foreground", TEXT.note)}>
            {holdWords(hold)}
            {flown ? ` · ${flown.entry} entry` : ""}
          </span>
        </span>
        {flown && <span className={cn("shrink-0 font-semibold tabular-nums", TEXT.detail)}>+{Math.round(flown.minutes)} min</span>}
        <ChevronRight className="size-5 shrink-0 text-tint" aria-hidden="true" />
      </button>
    </li>
  );
}

/** The move the list's grips make (RouteListDrag), from one typed
 *  point's place to another's. */
const RouteMove = createContext<((from: number, to: number) => void) | undefined>(undefined);

/**
 * The list's drag, by the points' grips (PointGrip): a grip let go over
 * another point's row moves its point there, as the route box's pills are
 * dragged (pointDrag, React Aria's drag and drop). Only the grips are
 * dragged and only the points' rows are dropped on, as the list between
 * them holds the legs' rows, the holds and the runways, none of them points
 * to move: the reason this is not a GridList, whose rows would all be
 * items. Nothing to drag, the list as it was.
 */
export function RouteListDrag({ on, children }: { on?: (from: number, to: number) => void; children: ReactNode }) {
  return <RouteMove.Provider value={on}>{children}</RouteMove.Provider>;
}

const ROW = "application/x-wingtip-route-row";

/** A typed point's grip, at its row's end, as iOS's reorder control is:
 *  dragged by a mouse or a finger, or picked up by Enter for the keyboard's
 *  and VoiceOver's drag (Tab to a place, Enter to put it down, Escape to
 *  let it go). A 32-point glyph with its 44-point area (index.css). What is
 *  dropped on is the point's whole row, its card where the list is cards:
 *  a cover laid over the row only while a point is out, so a drop anywhere
 *  on another counts and the row's own controls keep the pointer the rest
 *  of the time. */
export function PointGrip({ ident, index }: { ident: string; index: number }) {
  const on = useContext(RouteMove);
  const name = pointName(ident);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const cover = useRef<HTMLSpanElement>(null);
  const out = useDraggingKind(ROW);
  const move = usePointDrag({ kind: ROW, index, name, dropRef: cover, onMove: on && row ? (from) => on(from, index) : undefined });
  // Its own presses, not the sheet's drag. The browser's own drag image.
  const own = { onPointerDown: (event: PointerEvent<HTMLElement>) => event.stopPropagation() };
  return (
    <>
      <span
        {...mergeProps<"span">(move.dragProps, own)}
        ref={(node) => setRow(node?.closest("li") ?? null)}
        role="button"
        tabIndex={0}
        aria-label={`Move ${name}`}
        data-testid="route-grip"
        // Its drag the row's, not the stock sheet's.
        data-base-ui-swipe-ignore=""
        data-ident={ident}
        data-dragging={move.isDragging ? "" : undefined}
        className={cn(
          "relative grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-full text-muted-foreground outline-none select-none after:absolute after:-inset-1.5 after:content-[''] focus-visible:ring-2 focus-visible:ring-ring",
          move.isDragging && "opacity-30",
          move.isDropTarget && "bg-tint/12 text-tint",
        )}
      >
        <GripVertical className="size-5" aria-hidden />
      </span>
      {row &&
        createPortal(
          <span
            {...move.dropProps}
            ref={cover}
            tabIndex={-1}
            role={out && !move.isDragging ? "group" : undefined}
            aria-label={out && !move.isDragging ? `To ${name}'s place` : undefined}
            data-testid="route-drop"
            data-ident={ident}
            data-over={move.isDropTarget ? "" : undefined}
            className={cn(
              "absolute inset-0 z-20 rounded-2xl outline-none",
              out && !move.isDragging ? "pointer-events-auto" : "pointer-events-none",
              move.isDropTarget && "ring-2 ring-tint",
            )}
          />,
          row,
        )}
    </>
  );
}

/**
 * One step down the line the flight takes: its mark on the line, as the
 * nav log draws it, its name and the time it is reached, and under them
 * what is flown there (a field's). The line runs on to the next step.
 */
export function Step({
  mark,
  title,
  sub,
  figures,
  menu,
  grip,
  card = false,
  first = false,
  last,
  field = false,
  testId,
  icon,
  rename,
  children,
}: {
  /** A card's: its name a text box to change it (CardIdent). */
  rename?: (ident: string) => void;
  /** Its menu, behind its mark (PointMenu's `face`). */
  mark: ReactNode;
  /** After its name: the fuel in the tanks there (FuelGauge). */
  icon?: ReactNode;
  /** Its name, said to a screen reader and shown in its head, and the line
   *  under it: what it is, and how far along. */
  title: string;
  sub?: ReactNode;
  /** Its time over its altitude (PointFigures). */
  figures: ReactNode;
  menu?: (face: ReactNode) => ReactNode;
  /** Its grip, where the list changes the route (PointGrip). */
  grip?: ReactNode;
  /** A card of its own, as the fields' are where the list is cards. */
  card?: boolean;
  first?: boolean;
  last: boolean;
  field?: boolean;
  testId?: string;
  children?: ReactNode;
}) {
  const Name = field ? "h3" : "span";
  return (
    <li className={cn("relative flex gap-2.5", card && cn(POINT_CARD, "isolate"), card && !last && CARD_GAP)} data-testid={testId}>
      {!last && !card && <span aria-hidden="true" className="absolute top-3 bottom-0 left-[calc(0.875rem-1px)] w-0.5" style={ROUTE_LINE} />}
      {card && <CardThread first={first} last={last} />}
      <div className="relative flex w-7 shrink-0 justify-center pt-0.5">
        {card ? <CardMark>{menu ? menu(mark) : mark}</CardMark> : menu ? menu(mark) : mark}
      </div>
      <section aria-label={title} className={cn("min-w-0 flex-1 space-y-3", !card && (field ? "pb-5" : "pb-4"))}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex min-w-0 items-center gap-1">
              {rename ? (
                <Name className="min-w-0">
                  <CardIdent value={title} label={`${title}, change`} testId="step-ident" suggest={false} onCommit={rename} bold={field} />
                </Name>
              ) : (
                <Name className={cn("truncate", field ? "font-semibold" : "font-normal", TEXT.row)}>{title}</Name>
              )}
              {icon}
            </span>
            {sub && <span className={cn("truncate text-muted-foreground", TEXT.note)}>{sub}</span>}
          </div>
          {figures}
          {grip}
        </div>
        {children}
      </section>
    </li>
  );
}
