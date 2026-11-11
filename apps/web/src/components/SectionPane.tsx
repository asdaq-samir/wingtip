import type { ReactNode } from "react";
import { cn } from "cn";
import SectionTitle from "./SectionTitle";

/** A part of a tab that is not a section of its own -- En route's legs,
 *  its totals and table -- under its title (`heading`) as a section's is
 *  (AccordionSection, SectionTitle), and found by it (`data-title`, PanelTabs' scroll to
 *  a section asked for). */
export function SectionPane({ title, heading = false, children }: { title: string; heading?: boolean; children: ReactNode }) {
  return (
    <div data-title={title} className={cn(heading && "border-b py-4 last:border-b-0")}>
      {heading && <SectionTitle className="mb-2">{title}</SectionTitle>}
      {children}
    </div>
  );
}
