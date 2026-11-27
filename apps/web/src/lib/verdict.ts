/**
 * The Brief's Go / No-Go: every tab's own finding about the flight in one
 * list, each a row that opens where it was found -- the weather, the
 * airspace on the route, the altitude, the fuel, the runways, the loading
 * and the risk -- and one line over them saying what they come to. What
 * the pilot reads first on opening the Brief, as a flight service
 * briefer opens with adverse conditions and whether VFR is recommended
 * (AIM 7-1-5(b)(1), (b)(2)).
 * The findings are the planner's; the decision is the pilot in command's
 * (14 CFR 91.3), and the line says so.
 *
 * Worked out and put together by the shared engine (gonogo_brief, engine/crates/brief/src/gonogo/brief.rs,
 * through lib/engine), the very code behind the planner's POST
 * /api/go-no-go and the phones' `call`: the rules, their words and
 * their sources live there. Only the shapes are made here.
 */
import { create } from "zustand";
import { callEngine, type EngineInput } from "./engine/engine";
import type { Finding } from "./findings";

/** Where a finding is shown in full: a tab of the planning panel, and a
 *  section of it by its title. */
export interface Where {
  tab: "preflight" | "depart" | "enroute" | "arrive";
  section?: string;
}

export interface VerdictItem extends Where {
  key: "weather" | "airspace" | "altitude" | "oxygen" | "fuel" | "runways" | "balance" | "risk" | "fields";
  label: string;
  finding: Finding;
  /** What was found, in a line. */
  detail: string;
}

/** The sections the engine's Go / No-Go reads, as it reads them
 *  (gonogo_input's answer and the risk; the contract's VerdictInput). */
export type VerdictInput = NonNullable<EngineInput<"gonogo_brief">["verdict"]>;

/** The flight's facts the engine puts those sections together from
 *  (gonogo_input's input; the contract's GonogoFacts). */
export type VerdictFacts = NonNullable<EngineInput<"gonogo_brief">["facts"]>;

/** What the Go / No-Go comes to: the findings and the line over them. */
export interface Verdict {
  items: VerdictItem[];
  line: { finding: Finding; words: string };
}

/**
 * The Brief's Go / No-Go put together by the engine (gonogo_brief): from
 * the flight's facts (`facts`, which it builds into its sections itself,
 * gonogo_input, with the `risk` beside them) or from the sections built
 * (`input`); each tab's finding in the order a pilot goes through them,
 * the IFR alternate's in the weather's (`alternate`, /api/alternate's
 * answer, undefined while it is awaited), the fields row for a closed,
 * private or military-only field (`fields`, useRouteFields), the
 * airplane's findings left out where none is picked, and the line over
 * them. The page makes none of the shapes either way.
 */
export function briefVerdict({
  facts,
  risk,
  input,
  alternate,
  fields,
  airplane,
}: {
  facts?: VerdictFacts;
  risk?: VerdictInput["risk"];
  input?: VerdictInput;
  alternate?: EngineInput<"gonogo_brief">["alternate"];
  fields?: EngineInput<"gonogo_brief">["fields"];
  airplane: boolean;
}): Verdict {
  // The engine's items are plain strings; its keys, tabs and findings are
  // the ones VerdictItem names (gonogo/verdict.rs verdict_items).
  return callEngine("gonogo_brief", {
    ...(facts ? { facts, risk: risk ?? null } : { verdict: input }),
    alternate: alternate ?? null,
    fields: fields ?? null,
    airplane,
  }) as Verdict;
}

/** The findings for the flight on screen, published once (as the risk
 *  is, lib/frat) for the tabs' marks. */
export const useVerdict = create<{ items: VerdictItem[]; line: Verdict["line"] | null; set: (verdict: Verdict | null) => void }>((set) => ({
  items: [],
  line: null,
  set: (verdict) => set({ items: verdict?.items ?? [], line: verdict?.line ?? null }),
}));
