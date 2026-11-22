import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { allPads, padStore, savePad, type Pad, type PadStore, type Stroke } from "./padStore";
import { templateOf } from "./templates";
import { PADS_KEY } from "./useScratchpads";

/** How long typing rests before the page is kept, ms: a box's every
 *  key is not a write. */
const KEEP_AFTER_MS = 400;

/**
 * One page's view model (PadView): its boxes as typed and its ink, each
 * change kept on the device -- the ink at once, a box once the typing
 * rests -- with the last stroke undone and the ink cleared.
 */
export function usePad(id: string, store: PadStore = padStore()) {
  const client = useQueryClient();
  const { data: pads } = useQuery({ queryKey: PADS_KEY, queryFn: () => allPads(store), staleTime: Infinity });
  const pad = pads?.find((p) => p.id === id) ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The page as last typed, not yet kept: kept as the page closes.
  const unsaved = useRef<Pad | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (unsaved.current) void savePad(store, unsaved.current);
    },
    [store],
  );
  const change = (next: (p: Pad) => Pad, now: boolean) => {
    if (!pad) return;
    const changed = { ...next(pad), updated: new Date().toISOString() };
    client.setQueryData<Pad[]>(PADS_KEY, (old = []) => old.map((p) => (p.id === id ? changed : p)));
    if (timer.current) clearTimeout(timer.current);
    const keep = () => {
      unsaved.current = null;
      void savePad(store, changed);
    };
    unsaved.current = changed;
    if (now) keep();
    else timer.current = setTimeout(keep, KEEP_AFTER_MS);
  };
  return {
    pad,
    template: pad ? templateOf(pad.template) : null,
    setField: (key: string, value: string) => change((p) => ({ ...p, fields: { ...p.fields, [key]: value } }), false),
    addStroke: (stroke: Stroke) => change((p) => ({ ...p, strokes: [...p.strokes, stroke] }), true),
    undoStroke: () => change((p) => ({ ...p, strokes: p.strokes.slice(0, -1) }), true),
    clearInk: () => change((p) => ({ ...p, strokes: [] }), true),
  };
}
