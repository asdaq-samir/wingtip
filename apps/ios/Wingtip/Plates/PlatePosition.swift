import Foundation

/// Own ship on an approach plate's page full screen, as an EFB's
/// geo-referenced plates draw it (the owner, 2026-11-13: "Can the current
/// position show on the plate when in full screen as well?"; the web's
/// features/plates/platePosition): where the engine puts the fix on the
/// page by the plate's own georeference (plate_page_point, the planner's
/// PlatePage.georeference), turned to the GPS's track on the page. Nothing
/// is worked out here: the projection, the page's affine and the plan
/// view's box are the engine's (engine/crates/core/src/plate.rs).
struct PageMark: Equatable {
    /// Fractions of the page's width from its left and its height from its top.
    let x: Double
    let y: Double
    /// The track turned onto the page, degrees clockwise from its up; nil
    /// with no track.
    let rotationDeg: Double?
    /// At flying speed by the engine's `underway`: the airplane drawn
    /// pointing along its track, else a dot.
    let moving: Bool
}

enum PlatePosition {
    /// The fix on the page, or nil: no fix (own ship off), no georeference
    /// (a plate whose page is turned in its PDF, not placed), or a fix the
    /// engine leaves off the page -- outside the plan view or inside an
    /// inset cut from it, the only part of the plate drawn to scale.
    static func mark(_ fix: OwnShip.Fix?, georeference: APIPlateGeoreference?) -> PageMark? {
        guard let fix, let georeference else { return nil }
        guard let at = try? Engine.platePagePoint(
            lat: fix.coordinate.latitude, lon: fix.coordinate.longitude,
            trackDeg: fix.trackDeg, georeference: engine(georeference)) else { return nil }
        return PageMark(x: at.x, y: at.y, rotationDeg: at.rotationDeg,
                        moving: (try? Flight.underway(fix.groundspeedKt)) ?? false)
    }

    /// The planner's georeference as the engine's contract takes it: the
    /// same members, one type each side of the planner's API.
    static func engine(_ g: APIPlateGeoreference) -> EngineContract.PlatePagePointInputGeoreference {
        let box = { (b: APIPlateBox) in EngineContract.PlatePageBox(left: b.left, bottom: b.bottom, right: b.right, top: b.top) }
        return EngineContract.PlatePagePointInputGeoreference(
            lat0: g.lat0, lon0: g.lon0, lat1: g.lat1, lat2: g.lat2, toPage: g.toPage,
            widthPt: g.widthPt, heightPt: g.heightPt, planView: box(g.planView), insets: g.insets?.map(box))
    }
}
