import type { LucideIcon } from "lucide-react";
import type { TabGlyph } from "./tabGlyphs";

/** A tab glyph from one of lucide's icons, for a bar whose tabs are not
 *  drawn here (the developer's Train and Perf): the one weight the tabs
 *  had, no filled face. */
export function fromLucide(Icon: LucideIcon): TabGlyph {
  return function LucideGlyph({ className }: { className?: string }) {
    return <Icon className={className} strokeWidth={2.25} absoluteStrokeWidth aria-hidden="true" />;
  };
}
