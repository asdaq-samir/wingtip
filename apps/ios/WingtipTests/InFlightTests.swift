import CoreLocation
import Foundation
import PDFKit
import Testing
import UIKit
@testable import Wingtip

/// The flight's instruments in the air (#218): the engine's in_flight,
/// vertical_speed, glide_ring and the diagram's own ship as the phone
/// asks them (InFlight, DiagramPage), and the bar's writing of them.
@MainActor
struct InFlightTests {
    /// North along 88 W for a degree, then east.
    private func ask(lat: Double, lon: Double, kt: Double) throws -> InFlight.Progress {
        try Engine.call("in_flight", json: [
            "fix": ["lat": lat, "lon": lon, "track_deg": 0.0, "speed_kt": kt] as [String: Any],
            "line": [[42.0, -88.0], [43.0, -88.0], [43.0, -87.0]],
            "points": [["name": "A", "lat": 42.0, "lon": -88.0], ["name": "B", "lat": 43.0, "lon": -88.0], ["name": "C", "lat": 43.0, "lon": -87.0]],
            "legs": [["distance_nm": 60.0, "fuel_gal": 6.0], ["distance_nm": 44.0, "fuel_gal": 4.4]],
            "fuel_start_gal": 40.0, "now_s": 1_793_620_000.0,
        ])
    }

    @Test func halfWayUpTheFirstLegTheNextIsItsEnd() throws {
        let p = try ask(lat: 42.5, lon: -88.05, kt: 120)
        #expect(p.onRoute)
        #expect(p.next?.name == "B" && abs((p.next?.distanceNm ?? 0) - 30) < 0.5)
        #expect(abs((p.next?.eteMin ?? 0) - (p.next?.distanceNm ?? 0) / 2) < 0.001)
        #expect(p.destination?.name == "C")
        #expect(abs(p.burntGal - 3.0) < 0.1)
        // West of a northbound line is its left: 0.05 degrees of longitude
        // at 42.5 N is 2.2 nm.
        #expect(p.offSide == "left")
        #expect(InstrumentsBar.offCourse(p) == "2.2 nm left of course")
    }

    @Test func taxiingHasNoTimesAndOffTheLineIsNotOnTheRoute() throws {
        #expect(try ask(lat: 42.0, lon: -88.0, kt: 8).next?.eteMin == nil)
        // 0.2 degrees west is 8.8 nm off: past the engine's 3 nm.
        #expect(try ask(lat: 42.5, lon: -88.2, kt: 120).onRoute == false)
    }

    @Test func theVerticalSpeedAndTheRing() throws {
        let samples = (0...10).map { ["t_s": Double($0), "altitude_ft": 3000.0 + 5 * Double($0)] }
        let fpm: Double = try Engine.call("vertical_speed", json: ["samples": samples])
        #expect(abs(fpm - 300) < 0.001)
        // The c172 profile's own 9 to 1 (its POH's figure 3-1): 4,000 ft
        // over the ground, 9,000 ft a thousand, over 6,076 ft a mile.
        let ring: InFlight.Glide = try Engine.call("glide_ring", json: [
            "lat": 42.5, "lon": -88.0, "altitude_ft": 4800.0, "speed_kt": 100.0, "terrain_ft": 800.0, "field_ft": 700.0, "glide_ratio": 9.0,
        ])
        #expect(abs(ring.rangeNm - 4 * 9000 / (1852 / 0.3048)) < 1e-9 && ring.groundFt == 800 && ring.coordinates.count == 73)
        // No glide ratio: no ring, never a stock airplane's.
        let none: InFlight.Glide? = try Engine.call("glide_ring", json: [
            "lat": 42.5, "lon": -88.0, "altitude_ft": 4800.0, "speed_kt": 100.0, "terrain_ft": 800.0,
        ])
        #expect(none == nil)
    }

    @Test @MainActor func theRingIsOffUntilAnEmergencyWithTheAirplanesOwnGlide() throws {
        let defaults = try #require(UserDefaults(suiteName: "InFlightTests.ring"))
        defaults.removePersistentDomain(forName: "InFlightTests.ring")
        let plan = Plan()
        plan.flyType("c172")
        // Off by default (the owner, 2026-11-09), and no emergency open.
        #expect(InFlight.ringRatio(plan: plan, defaults: defaults) == nil)
        // Switched on, but no glide of the airplane's own is known yet.
        defaults.set(true, forKey: InFlight.ringKey)
        #expect(InFlight.ringRatio(plan: plan, defaults: defaults) == nil)
        // No airplane: no ring whatever is switched.
        plan.flyNoAirplane()
        #expect(InFlight.ringRatio(plan: plan, defaults: defaults) == nil)
    }

    @Test func theBarWritesTheFigures() throws {
        #expect(InstrumentsBar.verticalSpeed(304) == "+300")
        #expect(InstrumentsBar.verticalSpeed(-447) == "-450")
        #expect(InstrumentsBar.verticalSpeed(nil) == "—")
        #expect(InstrumentsBar.track(92, magnetic: nil) == "092°T")
        #expect(InstrumentsBar.track(92, magnetic: 89.6) == "090°")
        #expect(InstrumentsBar.minutesSeconds(7.5) == "7:30")
        // 2026-11-02 11:46:40 UTC.
        #expect(InstrumentsBar.zulu(1_793_620_000) == "1146Z")
    }

    @Test func ownShipIsPlacedOnKDLHsDiagram() throws {
        // KDLH's diagram (d-TPP 2612) has north to the page's left.
        let g: DiagramPage.Graticule = try Engine.call("diagram_graticule", json: ["labels": [
            ["text": "92°13'W", "x": 363.85, "y": 485.90], ["text": "46°51'N", "x": 69.35, "y": 77.21],
            ["text": "46°50'N", "x": 296.60, "y": 76.58], ["text": "92°12'W", "x": 362.69, "y": 328.17],
        ]])
        #expect(g.latOnX && g.northDeg == 270)
        let page = DiagramPage(document: PDFDocument(), size: CGSize(width: 387.36, height: 594), graticule: g)
        let fix = OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 46.8417, longitude: -92.1936), altitudeFt: 1428,
                              trackDeg: 90, groundspeedKt: 10, accuracyM: 5, at: Date())
        let at = try #require(try page.place(fix))
        #expect(at.onPage && abs(at.x - 183) < 2)
    }

    @Test func ownShipGoesWhenItsFixIsStaleOrCoarse() throws {
        // AC 120-76D 11.17.2.3 and 11.17.2.4: off within 3 s, none past 30 m.
        let now = Date()
        let fix = { (age: TimeInterval, metres: Double) in
            OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 46.84, longitude: -92.19), altitudeFt: nil, trackDeg: nil,
                        groundspeedKt: 0, accuracyM: metres, at: now.addingTimeInterval(-age))
        }
        #expect(try DiagramPage.usable(fix(1, 5), now: now) != nil)
        #expect(try DiagramPage.usable(fix(3.5, 5), now: now) == nil)
        #expect(try DiagramPage.usable(fix(1, 31), now: now) == nil)
    }
}
