package app.wingtipmaps.android.plates

import app.wingtipmaps.android.api.generated.PlateBox
import app.wingtipmaps.android.api.generated.PlateGeoreference
import app.wingtipmaps.android.engine.Engine
import app.wingtipmaps.android.engine.generated.EngineContract
import app.wingtipmaps.android.engine.generated.platePagePoint
import app.wingtipmaps.android.flight.OwnShip

/**
 * Where the pilot is on an approach plate's page full screen (the owner,
 * 2026-11-13: "Can the current position show on the plate when in full
 * screen as well?"), the web's features/plates/platePosition: the
 * engine's plate_page_point through the plate's own GeoPDF georeference
 * (its Lambert conformal conic and the page's affine, Snyder, USGS PP
 * 1395), as fractions of the page's width from the left and its height
 * from the top, with the GPS's true track turned onto the page. Null --
 * nothing drawn -- with no fix, no georeference (a page turned in its
 * PDF), or a fix outside the plan view's box or inside an inset cut from
 * it, the plan view being the only part drawn to scale.
 */
object PlatePosition {
    fun of(fix: OwnShip.Fix?, georeference: PlateGeoreference?): Result<EngineContract.PlatePagePointAnswer?> {
        if (fix == null || georeference == null) return Result.success(null)
        return Engine.platePagePoint(fix.lat, fix.lon, fix.trackDeg, asked(georeference))
    }

    /** The planner's georeference as the engine's contract takes it. */
    fun asked(g: PlateGeoreference): EngineContract.PlatePagePointInputGeoreference =
        EngineContract.PlatePagePointInputGeoreference(
            lat0 = g.lat0, lon0 = g.lon0, lat1 = g.lat1, lat2 = g.lat2, toPage = g.toPage,
            widthPt = g.widthPt, heightPt = g.heightPt, planView = box(g.planView), insets = g.insets?.map(::box),
        )

    private fun box(b: PlateBox) = EngineContract.PlatePageBox(left = b.left, bottom = b.bottom, right = b.right, top = b.top)
}
