import { drawTag } from "../../lib/map/gl/drawTag";
import type { Layout } from "../../lib/map/gl/markLayers";
import type { GlPicture } from "../../lib/map/gl/useGlSymbols";
import { CHART } from "../../lib/tokens";
import type { TagView } from "./plateTags";

/** A fix's tag over its plate (TagView): a dark chip above the fix, so
 *  the procedure's own diamond and its words beside it stay clear; its
 *  name, then each line, an altitude barred as the plate bars it (drawn
 *  as a picture: MapLibre's text has no bars). Not a tap target, so a
 *  tap on it is the plate's or the fix's beneath. */
export function plateTag(tag: Pick<TagView, "ident" | "lines">): GlPicture {
  const lines = [
    { runs: [{ text: tag.ident, colour: CHART.casing }] },
    ...tag.lines.map((l) => ({ runs: [{ text: l.text, colour: CHART.casing }], under: l.under, over: l.over })),
  ];
  return {
    id: `plate-tag|${JSON.stringify(lines)}`,
    draw: () => drawTag({ lines, background: CHART.tag, size: 13, lineHeight: 16, padX: 6, padY: 2, radius: 6, centred: true }),
  };
}

/** The tag's bottom 14 points above the fix (its picture has 4 of shadow
 *  round it). */
export const PLATE_TAG_PLACE: Layout = { "icon-anchor": "bottom", "icon-offset": [0, -10] };
