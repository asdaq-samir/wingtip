import Foundation
import Testing
@testable import Wingtip

/// FPL's timeline's points (Timeline): their roles, what is a field, the
/// minutes to each from the planner's legs, and the list's edits kept off
/// the ends.
@MainActor
struct TimelineTests {
    private func leg(_ from: String, _ to: String, ete: Double, ground: Double? = nil) -> Leg {
        Leg.preview(from: from, to: to, distanceNm: 50, trueCourseDeg: 0, magneticHeadingDeg: 0, eteMin: ete, groundMin: ground)
    }

    @Test func thePointsInOrderEachWhatItIs() {
        let points = Timeline.points(dep: "@42.3246,-88.0741", stops: ["KMSN", "VPBNG"], dest: "KDLH", stopKinds: ["airport", "fix"],
                                     fuelStops: ["KMSN"], legs: [], timed: false)
        #expect(points.map(\.role) == [.departure, .stop, .stop, .destination])
        #expect(points[0].position && !points[0].field && points[0].name == "My Position")
        #expect(points[1].field && points[1].fuelStop)
        #expect(!points[2].field && !points[2].fuelStop)
        #expect(points[3].field && points[3].tank == .destination)
        #expect(points[1].tank == .stop(0))
        #expect(points.allSatisfy { $0.minutes == nil })
    }

    @Test func theMinutesAreTheLegsWithTheTimeOnTheGroundAfterAStop() {
        let legs = [leg("C81", "KMSN", ete: 40, ground: 30), leg("KMSN", "KDLH", ete: 90)]
        let minutes = Timeline.minutes(dep: "C81", stops: ["KMSN"], dest: "KDLH", legs: legs)
        #expect(minutes == [0, 40, 160])
        // No airplane, no time: none assumed (docs/decisions/0011).
        let untimed = Timeline.points(dep: "C81", stops: ["KMSN"], dest: "KDLH", stopKinds: [nil], fuelStops: [], legs: legs, timed: false)
        #expect(untimed.allSatisfy { $0.minutes == nil })
    }

    @Test func theEndsAreNeverRemovedOrMovedFromTheList() {
        #expect(Timeline.stopOffsets(IndexSet([0, 1, 3]), stops: 2) == IndexSet([0]))
        #expect(Timeline.stopOffsets(IndexSet([2]), stops: 2) == IndexSet([1]))
        // Dropped before the departure or after the destination: kept
        // among the stops.
        #expect(Timeline.stopDestination(0, stops: 2) == 0)
        #expect(Timeline.stopDestination(4, stops: 2) == 2)
        #expect(Timeline.stopDestination(2, stops: 2) == 1)
    }
}
