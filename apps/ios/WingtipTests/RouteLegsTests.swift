import CoreGraphics
import Foundation
import Testing
@testable import Wingtip

/// The Route Leg sheet: the legs of the route point to point, the one a
/// tap is nearest, and each leg's figures and actions (the web's useLegSheet).
@MainActor
struct RouteLegsTests {
    private let checkpoint = Checkpoint(alongTrackNm: 28, category: "lake", id: "nebagamon", lat: 46.5, lon: -91.7, predictedScore: 1, selected: true)
    private var points: [(name: String, lat: Double, lon: Double, checkpoint: Checkpoint?)] {
        [("KDLH", 46.84, -92.19, nil), ("Lake Nebagamon", 46.5, -91.7, checkpoint), ("KHIB", 47.39, -92.84, nil), ("KGPZ", 47.21, -93.51, nil)]
    }
    private let navLog = [
        Leg.preview(from: "KDLH", to: "Lake Nebagamon", distanceNm: 28.1, trueCourseDeg: 136, magneticHeadingDeg: 137, magneticVariationDeg: -1),
        Leg.preview(from: "Lake Nebagamon", to: "KHIB", distanceNm: 64.0, trueCourseDeg: 322, magneticHeadingDeg: 323, magneticVariationDeg: -1),
        Leg.preview(from: "KHIB", to: "KGPZ", distanceNm: 31.8, trueCourseDeg: 248, magneticHeadingDeg: 249, magneticVariationDeg: -1),
    ]

    @Test func legsRunPointToPoint() {
        let legs = RouteLegs.legs(points)
        #expect(legs.map { "\($0.from)>\($0.to)" } == ["KDLH>Lake Nebagamon", "Lake Nebagamon>KHIB", "KHIB>KGPZ"])
        #expect(legs[0].toCheckpoint && !legs[1].toCheckpoint)
        #expect(RouteLegs.legs(Array(points.prefix(1))).isEmpty)
    }

    @Test func aTapOpensTheNearestLegWithinTheHitArea() {
        let segments = [(CGPoint(x: 0, y: 0), CGPoint(x: 100, y: 0)), (CGPoint(x: 100, y: 0), CGPoint(x: 100, y: 100))]
        #expect(RouteLegs.nearest(to: CGPoint(x: 50, y: 10), segments: segments) == 0)
        #expect(RouteLegs.nearest(to: CGPoint(x: 95, y: 60), segments: segments) == 1)
        // Past the 22-point half of the 44-point hit area: nothing.
        #expect(RouteLegs.nearest(to: CGPoint(x: 50, y: 30), segments: segments) == nil)
        #expect(RouteLegs.distance(CGPoint(x: -3, y: 4), CGPoint(x: 0, y: 0), CGPoint(x: 10, y: 0)) == 5)
    }

    @Test func aStopsLegCanBeFlownDirectOrRemovedAndShowsTheNavLogsFigures() {
        let legs = RouteLegs.legs(points)
        let sheet = RouteLegs.sheet(legs[1], mapLegs: 3, legs: navLog, nextIndex: 2, stops: ["KHIB"], dest: "KGPZ", direct: nil)
        #expect(sheet.distanceNm == 64.0 && sheet.courseMagDeg == 323)
        #expect(RouteLegs.courseWords(sheet.courseMagDeg) == "323°M")
        // The airplane flies to point 2, KHIB: this leg is the active one.
        #expect(sheet.active)
        #expect(sheet.direct?.ident == "KHIB" && sheet.direct?.on == false && sheet.remove == "KHIB")
    }

    @Test func aCheckpointHasNoActionsAndTheDestinationNoRemove() {
        let legs = RouteLegs.legs(points)
        let toCheckpoint = RouteLegs.sheet(legs[0], mapLegs: 3, legs: navLog, nextIndex: nil, stops: ["KHIB"], dest: "KGPZ", direct: nil)
        #expect(toCheckpoint.direct == nil && toCheckpoint.remove == nil && !toCheckpoint.active)
        let toDest = RouteLegs.sheet(legs[2], mapLegs: 3, legs: navLog, nextIndex: nil, stops: ["KHIB"], dest: "KGPZ", direct: "KGPZ")
        #expect(toDest.direct?.on == true && toDest.remove == nil)
        // A nav log that is not one to one with the map's legs gives no figures.
        let partial = RouteLegs.sheet(legs[2], mapLegs: 3, legs: Array(navLog.prefix(2)), nextIndex: nil, stops: [], dest: "KGPZ", direct: nil)
        #expect(partial.distanceNm == nil && RouteLegs.courseWords(partial.courseMagDeg) == "—")
    }
}
