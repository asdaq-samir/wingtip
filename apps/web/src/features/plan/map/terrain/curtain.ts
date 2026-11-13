import { SolidPolygonLayer } from "@deck.gl/layers";
import { deckColour, deckSlot } from "../../../../lib/map/gl/deckLayers";

/** The line in the air: 150 m across, and never thinner than a few points
 *  far out. */
export const ALOFT_WIDTH_M = 150;
export const ALOFT_MIN_PX = 3;

/** A curtain's walls as deck.gl draws them: upright polygons in 3D, see-
 *  through, the ground hiding their foot (geometry's curtainWalls). */
export function curtainLayer(id: string, walls: number[][][], colour: string, opacity: number) {
  return new SolidPolygonLayer<number[][]>({
    id,
    data: walls,
    getPolygon: (w) => w as never,
    _full3d: true,
    getFillColor: deckColour(colour, opacity),
    material: false,
    parameters: { depthWriteEnabled: false },
    ...deckSlot("route"),
  });
}
