import CoreLocation
import Foundation
import Testing
@testable import Wingtip

/// The work the app used to do again at every fix with nothing new to show
/// (the phones' wasted-work audit, 2026-11-21): each case asks that a
/// repeat with the same input asks nothing, and that what does change
/// still asks.
@MainActor
struct RepeatedWorkTests {
    // MARK: The fields at rest (item 1)

    @Test func followingOwnShipAsksForTheFieldsOnlyOutsideTheBoxOrAfterTenMinutes() {
        var rested = RestedFetch()
        let start = Date(timeIntervalSince1970: 1_000_000)
        let view = ViewBox(south: 41, west: -89, north: 42, east: -88)
        #expect(rested.wants(view, zoom: 8.2, now: start))
        _ = rested.ask(view, zoom: 8.2, now: start)
        // A second later the camera has moved a few hundred metres with own ship.
        let moved = ViewBox(south: 41.003, west: -88.997, north: 42.003, east: -87.997)
        #expect(!rested.wants(moved, zoom: 8.2, now: start.addingTimeInterval(1)))
        // Past the box, at a new level, or ten minutes on, it asks again.
        #expect(rested.wants(ViewBox(south: 42, west: -89, north: 43, east: -88), zoom: 8.2, now: start.addingTimeInterval(1)))
        #expect(rested.wants(moved, zoom: 9.0, now: start.addingTimeInterval(1)))
        #expect(rested.wants(moved, zoom: 8.2, now: start.addingTimeInterval(RestedFetch.every)))
        // Nothing came back: the next rest asks.
        rested.forget()
        #expect(rested.wants(moved, zoom: 8.2, now: start.addingTimeInterval(2)))
    }
}
