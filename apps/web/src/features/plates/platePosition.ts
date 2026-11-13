import type { PlateGeoreference } from "../../lib/api/types";
import type { PageMark } from "../../lib/diagram";
import { callEngine, engineLoaded } from "../../lib/engine/engine";
import { underway } from "../../lib/map/position/glide";
import type { Fix } from "../../lib/map/position/ownShip";

/**
 * Own ship on a plate's page full screen, as an EFB's geo-referenced
 * plates draw it (the owner, 2026-11-13: "Can the current position show
 * on the plate when in full screen as well?"): where the engine puts the
 * fix on the page by the plate's own georeference (plate_page_point,
 * PlateOverlay.page.georeference), turned to the GPS's track on the page.
 * Null with no fix, no georeference (a plate whose page is turned in its
 * PDF, not placed) or where the fix is outside the plan view or in an
 * inset of it, the only part of the plate drawn to scale.
 */
export function pageMarkOf(fix: Fix | null, georeference: PlateGeoreference | null | undefined): PageMark | null {
  if (!fix || !georeference || !engineLoaded()) return null;
  const at = callEngine("plate_page_point", { lat: fix.lat, lon: fix.lon, track_deg: fix.headingDeg, georeference });
  return at && { x: at.x, y: at.y, rotationDeg: at.rotation_deg, moving: underway(fix) };
}
