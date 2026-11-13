import CoreLocation
import Foundation
import Testing
@testable import Wingtip

private final class AutoLogFixtureBundle {}

/// The shared fixture's flight (apps/web/src/lib/fixtures/logbookTrack.json:
/// C81 to KDLH, a hold, a touch-and-go and a full stop) as the phone
/// records it: its points, the airplane and the pilot's clock.
private struct TrackFixture: Decodable {
    let points: [EngineContract.TrackPoint]
}

private func trackFixture() throws -> TrackFixture {
    let url = try #require(Bundle(for: AutoLogFixtureBundle.self).url(forResource: "logbookTrack", withExtension: "json"))
    return try JSONDecoder().decode(TrackFixture.self, from: Data(contentsOf: url))
}

/// The automatic logbook (FlightRecorder, AutoLogbook): when a recorded
/// flight has ended, what is kept before flying speed, and the entry sent.
@MainActor
struct AutoLogbookTests {
    @Test func aFlightEndsWhereTheEngineFindsItLandedAndAtRest() throws {
        let points = try trackFixture().points
        let answer = try Engine.logbookFromTrack(points: points)
        let ended = try #require(FlightRecorder.flightEnded(answer, points: points, askedTo: nil))
        #expect(ended == answer.block.to)
        // Offered once and let go: not again until a later landing.
        #expect(FlightRecorder.flightEnded(answer, points: points, askedTo: ended) == nil)
        // Half way, still in the air: no flight ended.
        let half = Array(points.prefix(points.count / 2))
        #expect(FlightRecorder.flightEnded(try Engine.logbookFromTrack(points: half), points: half, askedTo: nil) == nil)
    }

    @Test func onlyTheLastTenMinutesAreKeptBeforeFlyingSpeed() throws {
        let file = FileManager.default.temporaryDirectory.appending(path: "recorder-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: file) }
        let recorder = FlightRecorder(file: file)
        let start = Date(timeIntervalSince1970: 1_794_254_240)
        func fix(_ s: Double, kt: Double) -> OwnShip.Fix {
            OwnShip.Fix(coordinate: CLLocationCoordinate2D(latitude: 42.32, longitude: -88.07), altitudeFt: 788, trackDeg: 0,
                        groundspeedKt: kt, accuracyM: 5, at: start.addingTimeInterval(s))
        }
        // Fifteen minutes on the ground, a fix a second: one point each 5 s, the last ten minutes kept.
        for s in stride(from: 0.0, through: 900, by: 1) { #expect(recorder.took(fix(s, kt: 0)) == false) }
        #expect(recorder.points.count == 121 && recorder.points.first?.t == (start.timeIntervalSince1970 + 300) * 1000)
        // At flying speed: every point kept, and the phone keeps reading in the background.
        #expect(recorder.took(fix(905, kt: 80)) == true)
        #expect(recorder.kept.flown)
        recorder.forget()
        #expect(recorder.points.isEmpty && !recorder.kept.flown)
    }

    @Test func theEntrySentIsTheDraftWithThePilotsChanges() throws {
        let points = try trackFixture().points
        let answer = try Engine.logbookFromTrack(points: points, aircraft: "N3429J", aircraftType: "C150", utcOffsetMin: -360)
        // The engine's answer is the planner's /api/logbook-draft as it sends it.
        let draft = try Planner.json.decode(AutoLogbook.Draft.self, from: Engine.encoder.encode(answer))
        var edits = AutoLogbook.Edits()
        edits.totalHours = 2.5
        let sent = AutoLogbook.entryRequest(draft, edits: edits, byInstruments: false, flightId: 40)
        #expect(sent.totalHours == 2.5 && sent.nightHours == draft.entry.nightHours && sent.aircraft == "N3429J")
        #expect(sent.fromTrack && sent.flightId == 40 && sent.airHours == draft.entry.airHours && sent.touchAndGoes == draft.entry.touchAndGoes)
        // 61.57(c)'s items only where flown by instruments (61.51(g)(1)).
        #expect(sent.approaches == 0 && !sent.holding)
        let flown = AutoLogbook.entryRequest(draft, edits: edits, byInstruments: true, flightId: nil)
        #expect(flown.approaches == draft.instrument.approaches && flown.holding == draft.instrument.holding && flown.flightId == nil)
    }

    @Test func theLikelySavedFlightIsTheNewestWithTheRoutesEnds() {
        func flight(_ id: Int, _ from: String, _ to: String) -> SavedFlight {
            SavedFlight(aircraftTailNumber: nil, altitudes: nil, createdAt: "2026-11-09T12:00:00Z", cruiseAltitudeFt: nil, departureIdent: from,
                        destinationIdent: to, id: id, picks: nil, plannedFor: nil, risk: nil, stops: [], totalDistanceNm: nil, totalEteMin: nil, totalFuelGal: nil)
        }
        let flights = [flight(3, "KMSN", "KDLH"), flight(2, "C81", "KDLH"), flight(1, "C81", "KDLH")]
        #expect(AutoLogbook.likelyFlight(flights, route: "C81 KRFD KDLH")?.id == 2)
        #expect(AutoLogbook.likelyFlight(flights, route: "C81 KUGN") == nil && AutoLogbook.likelyFlight(flights, route: "") == nil)
    }
}
