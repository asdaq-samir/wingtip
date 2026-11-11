import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AirportPlace } from "../../../../lib/api/types";
import { callEngine, type EngineAnswer } from "../../../../lib/engine/engine";
import { fieldNotamsQuery, identsOf, type FieldNotam } from "./fieldNotams";

type EngineBadge = EngineAnswer<"notam_subject">["badges"][number];

/** A badge on one of the card's things: the engine's word, how bad and
 *  what it says, and the NOTAMs on it, the worst's first. */
export type NotamMark = Pick<EngineBadge, "word" | "severity" | "label"> & { notams: FieldNotam[] };

/** The card's badges, by what they are next to: the field and its fuel,
 *  its runways, lights and frequencies by their index in the place's
 *  lists, its approaches by their chart's address. */
export type NotamMarks = {
  field?: NotamMark;
  fuel?: NotamMark;
  runway: Map<number, NotamMark>;
  light: Map<number, NotamMark>;
  frequency: Map<number, NotamMark>;
  approach: Map<string, NotamMark>;
};

/** One more NOTAM on a thing: its badge where it is the worse (a closure
 *  over a caution), else the first's, in the engine's order. */
function add(prior: NotamMark | undefined, b: EngineBadge, n: FieldNotam): NotamMark {
  if (!prior) return { word: b.word, severity: b.severity, label: b.label, notams: [n] };
  const notams = prior.notams.includes(n) ? prior.notams : [...prior.notams, n];
  const worse = prior.severity === "caution" && b.severity === "unusable";
  return worse
    ? { word: b.word, severity: b.severity, label: b.label, notams: [n, ...notams.filter((m) => m !== n)] }
    : { ...prior, notams };
}

/**
 * What each of the field's NOTAMs addresses on its card, as the engine
 * reads it (notam_subject: JO 7930.2's keywords and conditions, matched to
 * the card's own runways, lights, approaches and frequencies), as badges
 * by what they go next to. The owner, 2026-11-11: "For anything the notam
 * addresses, just put a badge next to it". A NOTAM the planner says is not
 * yet in force is in the list on the Info tab, not on a badge: a badge says
 * what is so of the field now. Asked inside the card's EngineGate.
 */
export function notamMarks(notams: FieldNotam[], ident: string, place: AirportPlace | undefined): NotamMarks {
  const approaches = (place?.procedures ?? []).filter((c) => c.kind === "IAP");
  const card = {
    idents: identsOf(ident),
    runways: (place?.runways ?? []).map((r) => r.ends ?? ""),
    lights: (place?.lights ?? []).map((l) => ({ code: l.code ?? null, name: l.name, runways: l.runways })),
    approaches: approaches.map((c) => c.name),
    frequencies: (place?.frequencies ?? []).map((f) => ({ type: f.type ?? null, mhz: f.frequency_mhz ?? null })),
  };
  const marks: NotamMarks = { runway: new Map(), light: new Map(), frequency: new Map(), approach: new Map() };
  for (const n of notams) {
    if (n.in_force === false) continue;
    const { badges } = callEngine("notam_subject", { ...card, text: n.raw, tfr: n.kind === "tfr" });
    for (const b of badges) {
      const i = b.index ?? -1;
      if (b.on === "field") marks.field = add(marks.field, b, n);
      else if (b.on === "fuel") marks.fuel = add(marks.fuel, b, n);
      else if (b.on === "approach") {
        const url = approaches[i]?.url;
        if (url) marks.approach.set(url, add(marks.approach.get(url), b, n));
      } else marks[b.on].set(i, add(marks[b.on].get(i), b, n));
    }
  }
  return marks;
}

/** The card's badges, its view model's: the field's NOTAMs (the query the
 *  Info tab's list reads) against its place. */
export function useNotamMarks(ident: string, place: AirportPlace | undefined): NotamMarks {
  const { data } = useQuery(fieldNotamsQuery(ident));
  return notamMarks(data?.notams ?? [], ident, place);
}

/** Which NOTAMs are open over the card, from a tap on a thing's badge or
 *  its row (the owner, 2026-11-11: "tapping the affected thing should show
 *  the notam"); none while closed. */
export function useNotamSheet() {
  const [shown, setShown] = useState<FieldNotam[] | null>(null);
  return { shown, show: (mark: NotamMark) => setShown(mark.notams), close: () => setShown(null) };
}
