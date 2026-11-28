import { Suspense, type ComponentProps } from "react";
import { BriefCardChunk } from "./briefPagesChunk";

/** The Brief's card (BriefCard, briefPagesChunk), nothing in its place for
 *  the moment its chunk is still coming. */
export default function BriefCardPart(props: ComponentProps<typeof BriefCardChunk>) {
  return (
    <Suspense fallback={null}>
      <BriefCardChunk {...props} />
    </Suspense>
  );
}
