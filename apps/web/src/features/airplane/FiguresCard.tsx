import type { ReactNode } from "react";
import { SheetCard } from "../../components/SheetCard";
import type { FigureKey } from "../../lib/airplane/figures";
import FiguresTab from "./FiguresTab";
import type { AirplaneSlices } from "./useAirplaneCardModel";

/**
 * An airplane's planning figures, a card of their own over its card, opened
 * from its fourth button, Figures (the owner, 2026-11-26: "It should be the
 * fourth button above", the tab bar gone), or at once from the plan's
 * N-number's ⓘ or a figure asked for, its close back to the airplane's
 * card. Every figure edited in place, a missing one asked for there, then
 * its POH's row.
 */
export default function FiguresCard({
  m,
  poh,
  focus,
}: {
  m: AirplaneSlices<"head" | "nav" | "profile">;
  poh: ReactNode;
  focus: FigureKey | null;
}) {
  return (
    <SheetCard
      title="Figures"
      description={m.head.title}
      onClose={m.nav.closeFigures}
      testId="airplane-figures"
      // On the figure it was opened for, where it was one.
      initialFocus={() => {
        const field = focus ? document.querySelector<HTMLInputElement>(`[data-figure="${focus}"] input`) : null;
        field?.scrollIntoView({ block: "center" });
        return field ?? true;
      }}
    >
      <FiguresTab vm={m.profile} poh={poh} />
    </SheetCard>
  );
}
