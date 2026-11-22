import CoreLocation
import Foundation
import Observation
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

    // MARK: The watch's context (item 4)

    @Test func theWatchIsSentTheFixOnlyAfterAMileOrFiveMinutes() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        func fix(_ lat: Double, _ at: Date) -> WatchFix {
            WatchFix(lat: lat, lon: -88.07, altitudeFt: 2500, trackDeg: 0, groundspeedKt: 100, at: at)
        }
        let sent = fix(42.0, start)
        // A second on, a few hundred feet north: the fix sent stands, so the
        // context is the same and nothing is sent.
        let near = fix(42.0005, start.addingTimeInterval(1))
        #expect(WatchLink.fixToSend(near, sent: sent, sentAt: start, now: start.addingTimeInterval(1)) == sent)
        // Two miles north (a minute of latitude is a nautical mile): sent.
        let far = fix(42.0 + 2.0 / 60, start.addingTimeInterval(60))
        #expect(WatchLink.fixToSend(far, sent: sent, sentAt: start, now: start.addingTimeInterval(60)) == far)
        // Five minutes on, parked: sent again; none at first, and none once own ship has none.
        let later = start.addingTimeInterval(WatchLink.fixEveryS)
        #expect(WatchLink.fixToSend(fix(42.0, later), sent: sent, sentAt: start, now: later) == fix(42.0, later))
        #expect(WatchLink.fixToSend(near, sent: nil, sentAt: .distantPast, now: start) == near)
        #expect(WatchLink.fixToSend(nil, sent: sent, sentAt: start, now: start) == nil)
    }

    // MARK: Traffic against own height (item 5)

    @Test func ownShipsHeightIsReadToTheNearest10FtSoAFixsWanderAsksNothing() throws {
        #expect(Traffic.markedFt(3_204) == 3_200)
        #expect(Traffic.markedFt(3_196) == 3_200)
        #expect(Traffic.markedFt(3_205) == 3_210)
        #expect(Traffic.markedFt(nil) == nil)
        // An airplane 1,003 ft above the exact height reads as it does
        // 1,000 ft above the rounded one: "+10", hundreds cut toward own ship.
        let plane = TrafficAircraft(altitudeFt: 4_500, hex: "a93f1e", lat: 42, lon: -88)
        #expect(try Traffic.label(plane, ownFt: 3_497) == Traffic.label(plane, ownFt: Traffic.markedFt(3_497)))
    }

    // MARK: The map's body (item 6)

    @Test func ownShipsMarkedHeightChangesOnlyWithTheRoundedHeight() {
        let file = FileManager.default.temporaryDirectory.appending(path: "rec-\(UUID().uuidString).json")
        let ownShip = OwnShip(recorder: FlightRecorder(file: file))
        func take(_ metres: Double, at s: TimeInterval) {
            let location = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 42, longitude: -88), altitude: metres,
                                      horizontalAccuracy: 5, verticalAccuracy: 5, course: 0, speed: 0,
                                      timestamp: Date(timeIntervalSince1970: s))
            ownShip.took(OwnShip.fix(location))
        }
        // 1,000 m is 3,280.8 ft: read as 3,280.
        take(1_000, at: 1)
        #expect(ownShip.markedFt == 3_280)
        // A foot of wander leaves it, and the map reading it, alone.
        let seen = withObservationTracking { ownShip.markedFt } onChange: { Issue.record("markedFt changed for a foot of wander") }
        #expect(seen == 3_280)
        take(1_000.3, at: 2)
        #expect(ownShip.markedFt == 3_280)
    }

    // MARK: The airport card's distance (item 8)

    @Test func theCardsDistanceReadsAPlaceThatAParkedAirplanesJitterLeavesAlone() {
        let a = OwnShip.coarse(CLLocationCoordinate2D(latitude: 42.12301, longitude: -88.45702))
        let b = OwnShip.coarse(CLLocationCoordinate2D(latitude: 42.12305, longitude: -88.45698))
        #expect(a.latitude == 42.123 && a.longitude == -88.457)
        #expect(a.latitude == b.latitude && a.longitude == b.longitude)
        // A tenth of a mile north is a new place.
        #expect(OwnShip.coarse(CLLocationCoordinate2D(latitude: 42.1247, longitude: -88.457)).latitude != a.latitude)
    }

    // MARK: The GPS on the ground (item 10)

    @Test func theGpsIsAtItsBestOnlyFlyingFollowedOrOnADiagram() {
        let file = FileManager.default.temporaryDirectory.appending(path: "rec-\(UUID().uuidString).json")
        let ownShip = OwnShip(recorder: FlightRecorder(file: file))
        func take(kt: Double, at s: TimeInterval) {
            let location = CLLocation(coordinate: CLLocationCoordinate2D(latitude: 42, longitude: -88), altitude: 250,
                                      horizontalAccuracy: 5, verticalAccuracy: 5, course: 0, speed: kt / Units.ktPerMS,
                                      timestamp: Date(timeIntervalSince1970: s))
            ownShip.took(OwnShip.fix(location))
        }
        // Parked: the default configuration, still until it moves.
        take(kt: 0, at: 1)
        #expect(!ownShip.isPrecise)
        // The map following the airplane, or a diagram up: the best.
        ownShip.mapFollows = true
        #expect(ownShip.isPrecise)
        ownShip.mapFollows = false
        ownShip.diagramShown = true
        #expect(ownShip.isPrecise)
        ownShip.diagramShown = false
        #expect(!ownShip.isPrecise)
        // At flying speed (the engine's underway): the best, and it stays
        // so after landing while the recorder waits for the airplane to rest.
        take(kt: 100, at: 10)
        #expect(ownShip.isPrecise)
        take(kt: 0, at: 20)
        #expect(ownShip.isPrecise)
    }

    // MARK: The weather timelines out of sight (item 14)

    @Test func aPlayingLoopPausesOutOfSightAndPlaysAgainOnlyOnceFullyBack() {
        var sight = LoopSight()
        // The sheet up to full height over a playing loop: paused.
        #expect(sight.set(.covered, hidden: true, playing: true) == .pause)
        // Put away meanwhile, then back: still covered, so nothing yet.
        #expect(sight.set(.away, hidden: true, playing: false) == nil)
        #expect(sight.away)
        #expect(sight.set(.away, hidden: false, playing: false) == nil)
        // The sheet down: in sight, and it plays again.
        #expect(sight.set(.covered, hidden: false, playing: false) == .play)
        #expect(sight.inSight)
        // A loop the pilot had paused stays paused.
        #expect(sight.set(.covered, hidden: true, playing: false) == nil)
        #expect(sight.set(.covered, hidden: false, playing: false) == nil)
        // A pick while out of sight is the pilot's word: no resume after it.
        #expect(sight.set(.away, hidden: true, playing: true) == .pause)
        sight.picked()
        #expect(sight.set(.away, hidden: false, playing: false) == nil)
    }

    // MARK: Smaller items (item 15)

    @Test func theRoutesAndTheAlternatesWorseAsksEachKeepTheirOwnAnswer() {
        let field = { (ident: String, ceilingFt: Double) in
            EngineContract.WorseField(ident: ident, ceilingFt: ceilingFt, visibilitySm: 10, ceilingUnknown: false, arrival: true)
        }
        let route = FieldWeatherMarks.worse(now: [field("KMSN", 5000)], atEta: [field("KMSN", 800)])
        let alternates = FieldWeatherMarks.worse(now: [field("KRFD", 5000)], atEta: [field("KRFD", 4000)], asker: .alternates)
        // Both kept, so the next render's route ask is answered from its own slot.
        #expect(FieldWeatherMarks.lastWorse[.route]?.answer == route)
        #expect(FieldWeatherMarks.lastWorse[.alternates]?.answer == alternates)
        #expect(FieldWeatherMarks.worse(now: [field("KMSN", 5000)], atEta: [field("KMSN", 800)]) == route)
    }

    @Test func trafficIsNotAskedUnderAFullSheetOnTheGroundButIsInFlight() {
        func fix(kt: Double) -> OwnShip.Fix {
            OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 42, longitude: -88), altitudeFt: 800, trackDeg: 0,
                        groundspeedKt: kt, accuracyM: 5, at: Date())
        }
        #expect(Traffic.wanted(covered: false, fix: nil))
        #expect(!Traffic.wanted(covered: true, fix: fix(kt: 0)))
        #expect(!Traffic.wanted(covered: true, fix: nil))
        #expect(Traffic.wanted(covered: true, fix: fix(kt: 100)))
    }
}
