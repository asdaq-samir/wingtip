import CoreLocation
import Testing
@testable import Wingtip

/// Where a route point's name goes (RouteTurns, the owner's option A of
/// 2026-11-14; the web's routeTurns.test): outside the turn the course
/// makes there, and square to the course on its upper side where it goes
/// straight on or ends.
struct RouteTurnsTests {
    private func at(_ lat: Double, _ lon: Double) -> CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lon) }

    @Test func aLeftTurnPutsTheNameOutsideIt() {
        // East, then north: the turn is to the north-west, so the name goes
        // to the south-east, 135 degrees clockwise from up.
        let line = [at(40, -91), at(40, -90), at(41, -90)]
        #expect(RouteTurns.outside(of: line, at: at(40, -90)) == 135)
    }

    @Test func aRightTurnPutsTheNameOutsideIt() {
        // East, then south: the name goes to the north-east.
        let line = [at(40, -91), at(40, -90), at(39, -90)]
        #expect(RouteTurns.outside(of: line, at: at(40, -90)) == 45)
    }

    @Test func aStraightPointAndAnEndPutTheNameAboveTheCourse() {
        let line = [at(40, -91), at(40, -90), at(40, -89)]
        #expect(RouteTurns.outside(of: line, at: at(40, -90)) == 0)
        #expect(RouteTurns.outside(of: line, at: at(40, -89)) == 0)
        #expect(RouteTurns.outside(of: line, at: at(40, -91)) == 0)
    }

    @Test func aLineOfOnePointHasNoSide() {
        #expect(RouteTurns.outside(of: [at(40, -90)], at: at(40, -90)) == 0)
    }
}
