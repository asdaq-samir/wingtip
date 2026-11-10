import AppIntents
@testable import Wingtip
import XCTest

/// Siri's entities and what its intents say: ids that find the same thing
/// again with no planner, the approach Siri hears in "brief the ILS 27 at
/// Madison", the idents a camera look-up reads, and the NOTAM's words
/// falling back to the engine's reasons where the on-device model cannot
/// run.
final class SiriEntitiesTests: XCTestCase {
    func testAFlightIsItsRouteAndPlansItAgain() {
        let flight = FlightEntity(dep: "c81", stops: ["kosh"], dest: "kdlh")
        XCTAssertEqual(flight.id, "C81 KOSH KDLH")
        XCTAssertEqual(flight.command, .planRoute(dep: "C81", stops: ["KOSH"], dest: "KDLH"))
        XCTAssertNil(FlightEntity(id: "KMSN").command)
    }

    func testAFrequencyIdCarriesWhatItSays() {
        let tower = FrequencyEntity(field: "kmsn", APIFrequency(description: "MADISON TWR", frequencyMhz: 119.3, type: "TWR"))
        let again = FrequencyEntity(id: tower.id)
        XCTAssertEqual(again.field, "KMSN")
        XCTAssertEqual(again.mhz, tower.mhz)
        XCTAssertFalse(again.mhz.isEmpty)
        XCTAssertTrue(again.spoken.hasPrefix("KMSN "))
    }

    func testACheckpointIsFoundByItsName() {
        XCTAssertEqual(WaypointEntityQuery.name(of: "cp:Lake Mendota@43.1000,-89.4200"), "Lake Mendota")
        XCTAssertEqual(WaypointEntityQuery.name(of: "GOPHER"), "GOPHER")
        XCTAssertNil(WaypointEntity(id: "cp:Lake Mendota@43.1000,-89.4200", name: "Lake Mendota", role: "Checkpoint 1").ident)
        XCTAssertEqual(WaypointEntity(id: "KMSN", name: "Dane Co Rgnl", role: "Destination").ident, "KMSN")
    }

    func testAnApproachIsHeardAsPilotsSayIt() {
        let (words, place) = ApproachEntityQuery.split("ILS 36 at Madison")
        XCTAssertEqual(words, ["ILS", "36"])
        XCTAssertEqual(place, "Madison")
        XCTAssertEqual(ApproachEntityQuery.split("RNAV 18 KMSN").place, "KMSN")
        XCTAssertNil(ApproachEntityQuery.split("ILS runway 36").place)
        XCTAssertTrue(ApproachEntityQuery.matches("ILS OR LOC RWY 36", ["ILS", "runway", "36"]))
        XCTAssertTrue(ApproachEntityQuery.matches("RNAV (GPS) RWY 18", ["RNAV", "18"]))
        XCTAssertFalse(ApproachEntityQuery.matches("ILS OR LOC RWY 36", ["ILS", "18"]))
    }

    func testAnApproachIdPutsItOnTheRoute() {
        let approach = ApproachEntity(id: "KMSN|I36|ILS OR LOC RWY 36")
        XCTAssertEqual(approach.pick, ProcedurePick(ident: "KMSN", id: "I36", kind: "approach", name: "ILS OR LOC RWY 36", transition: nil))
        XCTAssertEqual(ApproachEntity(pick: approach.pick).id, approach.id)
    }

    func testACameraLookUpReadsIdentsNotRunways() {
        let lines = ["METAR KMSN 091853Z 27012KT 10SM", "RWY 27-9", "C81 CAMPBELL", "KNOW THE"]
        XCTAssertEqual(VisualRead.idents(in: lines), ["KMSN", "C81", "KNOW"])
        XCTAssertFalse(VisualRead.isIdent("27"))
        XCTAssertFalse(VisualRead.isIdent("RWY"))
        XCTAssertTrue(VisualRead.isIdent("PHNL"))
    }

    func testANotamIsExplainedByTheEnginesReasonsWithoutTheModel() async {
        struct NoModel: WordsProvider {
            func words(_ ask: WordsAsk) async throws -> Words { throw WordsUnavailable(why: "Apple Intelligence is off in Settings.") }
        }
        let reasons = [APINotamReason(key: "runway", words: "It closes runway 18/36 at your destination")]
        let figures = NotamWords.figures(id: "1/2345", raw: "!MSN 1/2345 MSN RWY 18/36 CLSD", reasons: reasons, flight: nil)
        XCTAssertEqual(figures.map(\.id), ["notam:1/2345", "why:runway"])
        let said = await NotamWords.said(figures, reasons: reasons, device: NoModel())
        XCTAssertEqual(said.text, "It closes runway 18/36 at your destination.")
        XCTAssertEqual(said.origin, AskOrigin.engine.caption)
        let unranked = await NotamWords.said(figures, reasons: [], device: NoModel())
        XCTAssertEqual(unranked.origin, "As sent")
    }

    func testAnAirplaneSaidIsItsNNumber() async throws {
        let found = try await AirplaneEntityQuery().entities(matching: "n123ab")
        XCTAssertEqual(found.first?.id, "N123AB")
        let none = try await AirplaneEntityQuery().entities(matching: "the cessna")
        XCTAssertTrue(none.isEmpty)
    }
}
