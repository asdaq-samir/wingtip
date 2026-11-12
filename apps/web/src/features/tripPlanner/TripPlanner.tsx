import { useState } from "react";
import { ArrowUp, Check, Square } from "lucide-react";
import { cn } from "cn";
import CloseButton from "../../components/CloseButton";
import IconButton from "../../components/IconButton";
import { PANEL_FIELD } from "../../components/panelField";
import SourceChips from "../../components/SourceChips";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import SkeletonLines from "../../components/SkeletonLines";
import type { TripLeg } from "../../lib/api/types";
import { clockTime, duration, feet, gal, nm } from "../../lib/format";
import { TEXT } from "../../lib/text";
import { useTripPlanner } from "./useTripPlanner";
import { FieldError } from "../../components/ui/field";

/** A chip's 44-point area round its 32 (CLAUDE.md's hit areas). */
const AREA = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']";

/** One leg: its route, when it leaves and lands on this device's clock,
 *  its altitude, distance, time and fuel, all the planner's, the go
 *  window it leaves in, and the planner's cautions; Use loads it. */
function Leg({ leg, used, canUse, onUse }: { leg: TripLeg; used: boolean; canUse: boolean; onUse: () => void }) {
  const route = [leg.change.dep, ...leg.change.stops, leg.change.dest].join(" → ");
  const leave = clockTime(new Date(leg.change.depart));
  const land = leg.arrive ? clockTime(new Date(leg.arrive)) : null;
  const figures = [feet(leg.altitude_ft), nm(leg.distance_nm), leg.ete_min != null ? duration(leg.ete_min) : null, gal(leg.fuel_gal)]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex flex-col gap-1.5" data-testid="trip-leg" data-kind={leg.kind}>
      <p className={cn("font-semibold", TEXT.prose)} data-testid="trip-route">
        {route}
      </p>
      <p className={cn("tabular-nums", TEXT.prose)} data-testid="trip-times">
        {leg.kind === "return" ? "Back" : "Leave"} {leave}
        {land ? `, land ${land}` : ""}
        {leg.window ? ` · in the go window ${clockTime(new Date(leg.window.start))}–${clockTime(new Date(leg.window.last))}` : ""}
      </p>
      <p className={cn("tabular-nums text-muted-foreground", TEXT.note)} data-testid="trip-figures">
        {figures}
      </p>
      {leg.cautions.map((c) => (
        <p key={c} className={cn("text-caution-ink", TEXT.note)}>
          {c}
        </p>
      ))}
      <Button
        size="sm"
        variant={used ? "secondary" : "default"}
        disabled={used || !canUse}
        className={cn("self-start rounded-full", AREA, used && "disabled:opacity-100")}
        onClick={onUse}
        data-testid="trip-use"
      >
        {used ? (
          <>
            <Check aria-hidden />
            Loaded
          </>
        ) : leg.kind === "return" ? (
          "Use return leg"
        ) : (
          "Use this plan"
        )}
      </Button>
    </div>
  );
}

/**
 * "Plan a trip…" in the Brief's Ask (AskSection opens it): the trip in the
 * pilot's words, the tool in use while it works, then the proposal as a
 * card -- the reason in the planner's words, each leg with its figures
 * and its Use, the constraints it could not meet said plainly, and the
 * reports it rests on. What went wrong is said in place (lib/problems).
 */
export default function TripPlanner({ onClose }: { onClose: () => void }) {
  const { state, canUse, plan, use, stop, clear } = useTripPlanner();
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim() || state.busy) return;
    void plan(text);
  };
  const p = state.proposal;
  return (
    <div className="flex flex-col gap-3" data-testid="trip-planner">
      {state.asked && (
        <p className={cn("max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3 py-1.5 text-primary-foreground", TEXT.prose)}>
          {state.asked}
        </p>
      )}
      {state.status && (
        <p className={cn("appear text-muted-foreground", TEXT.note)} role="status" data-testid="trip-status">
          {state.status}…
        </p>
      )}
      {/* The proposal's shape where it will be, until its first words. */}
      {state.status && !(p || state.words) && <SkeletonLines className="w-4/5 rounded-2xl rounded-bl-md bg-card px-3.5 py-3" />}
      {(p || state.words) && (
        <div className="flex flex-col gap-3 rounded-2xl rounded-bl-md bg-card px-3.5 py-3 shadow-float" data-testid="trip-proposal">
          {state.words && (
            <p className={cn("whitespace-pre-wrap", TEXT.prose)} data-testid="trip-words">
              {state.words}
            </p>
          )}
          {p?.legs.map((leg) => (
            <Leg key={leg.kind} leg={leg} used={state.used.includes(leg.kind)} canUse={canUse} onUse={() => use(leg)} />
          ))}
          {p && p.unmet.length > 0 && (
            <ul className="flex flex-col gap-1" data-testid="trip-unmet">
              {p.unmet.map((u) => (
                <li key={u} className={cn("text-caution-ink", TEXT.note)}>
                  {u}
                </li>
              ))}
            </ul>
          )}
          {!state.busy && <SourceChips sources={state.sources} testId="trip-source" />}
        </div>
      )}
      {state.error && (
        <FieldError className={cn("text-destructive-ink", TEXT.note)} data-testid="trip-problem">
          {state.error}
        </FieldError>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Describe the trip"
          aria-label="Describe the trip"
          enterKeyHint="send"
          autoComplete="off"
          data-testid="trip-field"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          className={cn("h-12 rounded-full border-0 px-4", PANEL_FIELD)}
        />
        {state.busy ? (
          <IconButton
            label="Stop"
            variant="secondary"
            size="icon-lg"
            className="size-12 shrink-0 rounded-full"
            onClick={stop}
            data-testid="trip-stop"
          >
            <Square className="size-4" />
          </IconButton>
        ) : (
          <IconButton
            label="Plan the trip"
            variant="default"
            size="icon-lg"
            className="size-12 shrink-0 rounded-full"
            onClick={send}
            disabled={!text.trim()}
            data-testid="trip-send"
          >
            <ArrowUp className="size-5" />
          </IconButton>
        )}
        {/* Every panel's close (CloseButton), where it drew its own ✕. */}
        <CloseButton
          label="Close the trip planner"
          className="shrink-0"
          onClick={() => {
            clear();
            onClose();
          }}
          data-testid="trip-close"
        />
      </div>
    </div>
  );
}
