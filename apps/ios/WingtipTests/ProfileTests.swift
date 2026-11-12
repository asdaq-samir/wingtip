import Foundation
import Testing
@testable import Wingtip

/// The Profile card's slider, waypoints and Altitude Advisor (the owner's
/// spec of 2026-11-10): what the model previews and when Set has work, the
/// waypoints along the side view, a leg's Start At sent to the planner,
/// and the engine's clearance and advisor as the card asks them.
@MainActor
struct ProfileTests {
    private static let legs = [
        Leg.preview(from: "KPAO", to: "KLVK", distanceNm: 28, altitudeFt: 4500, trueCourseDeg: 62, magneticHeadingDeg: 51, groundspeedKt: 108, eteMin: 16, fuelGal: 2.3, tasKt: 112),
        Leg.preview(from: "KLVK", to: "KMOD", distanceNm: 34, altitudeFt: 4500, trueCourseDeg: 105, magneticHeadingDeg: 94, groundspeedKt: 118, eteMin: 17, fuelGal: 2.4, tasKt: 112),
    ]

    @Test func theSliderPreviewsAndOnlySetChangesThePlan() {
        let plan = Plan()
        let model = ProfileModel()
        #expect(model.shownFt(plan: plan, airplaneFt: nil) == nil && !model.changed(plan: plan))
        model.preview(6500)
        #expect(model.shownFt(plan: plan, airplaneFt: nil) == 6500 && model.changed(plan: plan))
        #expect(plan.ownAltitudeFt == nil, "a preview never changes the plan")
        // Auto follows the airplane, and has nothing to Set.
        model.auto = true
        #expect(model.shownFt(plan: plan, airplaneFt: 3240) == 3240 && !model.changed(plan: plan))
        model.preview(5500)
        #expect(!model.auto)
    }

    @Test func theWaypointsSitWhereTheLegsEnd() {
        let points = ProfileRules.waypoints(legs: Self.legs)
        #expect(points.map(\.ident) == ["KPAO", "KLVK", "KMOD"])
        #expect(points.map(\.alongNm) == [0, 28, 62])
        #expect(ProfileRules.waypoints(legs: []).isEmpty)
    }

    @Test func aStartAtGoesToTheNavLogWithItsAltitude() throws {
        var extras = RouteExtras()
        extras.altitudes = ["VPBNG": 6500, "KLVK": 4500]
        extras.starts = ["VPBNG", "GONE"]
        var query = NavLogQuery(dep: "C81", dest: "KLVK")
        try extras.apply(to: &query, procedures: [])
        #expect(query.altitudes == "KLVK:4500,VPBNG:6500")
        #expect(query.altitudeStarts == "VPBNG", "a start with no altitude of its own is not sent")
    }

    @Test func theGroundIsColouredByHowCloseItComes() throws {
        let profile = RouteProfile(airspace: [], lengthNm: 62, terrain: [
            ProfileGround(alongNm: 0, groundFt: 1000), ProfileGround(alongNm: 28, groundFt: 3000), ProfileGround(alongNm: 62, groundFt: 2500),
        ])
        let near = try ProfileRules.clearance(altitudeFt: 3500, profile: profile, legs: Self.legs)
        #expect(near.level == "yellow" && near.redFromFt == 3000 && near.yellowFromFt == 2500)
        #expect(near.words == "3,500 ft, terrain within 500 ft near KLVK")
        #expect(try ProfileRules.clearance(altitudeFt: 3050, profile: profile, legs: Self.legs).level == "red")
    }

    @Test func theAdvisorMarksThePlansAndKeepsTheRowsOutside() throws {
        let line = NavLogAltitude(
            altitudeFigures: [AltitudeFigure(altitudeFt: 4500, eteMin: 60, everywhere: true, fuelGal: 9, tailwindKt: -4),
                              AltitudeFigure(altitudeFt: 6500, eteMin: 55, everywhere: true, fuelGal: 9.5, tailwindKt: 8)],
            altitudeFt: 4500,
            altitudeSelection: AltitudeSelection(airspaceTransits: [], courseMagneticDeg: 62, eastbound: true, floorFt: 1500, hazards: []))
        let rows = try ProfileRules.advisor(line, flownFt: 4500)
        let at = { (ft: Double) in rows.first { $0.altitudeFt == ft } }
        #expect(at(6500)?.fastest == true && at(4500)?.economical == true && at(4500)?.flown == true)
        #expect(at(5000)?.legal == false && at(5000)?.warning != nil, "warn, never limit")
        #expect(rows.first?.altitudeFt == 17_500)
    }
}
