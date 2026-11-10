import { useMemo } from "react";
import { PreviewCard, PreviewCardContent } from "../../../../components/ui/preview-card";
import AirportPreview from "../../components/preview/AirportPreview";

/** The preview at a point of the screen, Base UI's Preview Card held open
 *  and placed at the mark (a virtual anchor, as the canvas has no element
 *  for it); AirportHover opens and closes it. */
export default function AirportHoverCard({ ident, x, y }: { ident: string; x: number; y: number }) {
  const anchor = useMemo(() => ({ getBoundingClientRect: () => DOMRect.fromRect({ x, y, width: 0, height: 0 }) }), [x, y]);
  return (
    <PreviewCard open>
      <PreviewCardContent anchor={anchor} side="top" align="center" sideOffset={16} data-testid="airport-hover-card">
        <AirportPreview ident={ident} />
      </PreviewCardContent>
    </PreviewCard>
  );
}
