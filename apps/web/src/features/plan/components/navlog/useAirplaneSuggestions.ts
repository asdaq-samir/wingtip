import { useState } from "react";
import { shortName, tailTyped } from "../../../../lib/aircraftChoice";
import { wantScreen } from "../../../../lib/navigation/wanted";
import { useAirplaneHits } from "../../hooks/useAirplaneHits";
import type { SuggestionGroup } from "./AirplaneSuggestions";

/**
 * The FPL airplane field's suggestions (the owner's S1, 2026-11-14): the one
 * search's airplanes (useAirplaneHits) in its four groups, each pick what the
 * field does with an N-number -- one of the pilot's own flown, any other
 * taken as Enter takes it (`take`: on its type's book once the registry
 * answers, never another airplane's figures meanwhile), a type flown by the
 * book under the N-number typed. The registry's record only, not whether it
 * is in the air: the field asks nothing of the live sources.
 */
export function useAirplaneSuggestions({
  typed,
  engineReady,
  aircraftOptions,
  onAircraftChange,
  onTailPick,
  take,
}: {
  /** The N-number typed, "N" and what follows; null while nothing is being typed. */
  typed: string | null;
  engineReady: boolean;
  aircraftOptions: { value: string; label: string }[];
  onAircraftChange: (value: string) => void;
  onTailPick?: (tail: string, profile: string) => void;
  take: (tail: string) => void;
}) {
  const rest = (typed ?? "").replace(/^N/, "");
  const tail = engineReady && rest ? tailTyped(typed!) : null;
  const hits = useAirplaneHits({ typed: rest, tail, live: false, enabled: typed !== null && !!rest });
  // Escape or a tap away puts the list away for what is typed now; the next letter brings it back.
  const [dismissed, setDismissed] = useState<string | null>(null);
  // Typed on from there, the list is back, and stays for the same words typed again.
  if (dismissed !== null && typed !== dismissed) setDismissed(null);
  const fly = (own: string) => {
    const option = aircraftOptions.find((o) => shortName(o.label) === own);
    if (option) onAircraftChange(option.value);
    else take(own);
  };
  const groups = (
    [
      { heading: "Your airplanes", rows: hits.own.map((r) => ({ ...r, pick: () => fly(r.title) })) },
      {
        heading: "Recent and kept",
        rows: hits.kept.flatMap((r) => {
          const kept = tailTyped(r.kept.name);
          return kept ? [{ ...r, pick: () => take(kept) }] : [];
        }),
      },
      {
        heading: "FAA registry",
        rows: hits.registry ? [{ ...hits.registry, disabled: !hits.registry.whole, pick: () => take(hits.registry!.title) }] : [],
      },
      {
        heading: "Types",
        rows: hits.types.map((r) => ({ ...r, pick: () => (tail ? onTailPick?.(tail, r.profile.name) : wantScreen("airplanes")) })),
      },
    ] satisfies SuggestionGroup[]
  ).filter((g) => g.rows.length > 0);
  return { open: typed !== null && groups.length > 0 && dismissed !== typed, dismiss: () => setDismissed(typed), groups };
}
