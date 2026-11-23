import AppIntents
@testable import Wingtip
import Testing

/// Siri's entities and what its intents say: ids that find the same thing
/// again with no planner, the approach Siri hears in "brief the ILS 27 at
/// Madison", the idents a camera look-up reads, and the NOTAM's words
/// falling back to the engine's reasons where the on-device model cannot
/// run.
struct SiriEntitiesTests {
    @Test func aFlightIsItsRouteAndPlansItAgain() {
        let flight = FlightEntity(dep: "c81", stops: ["kosh"], dest: "kdlh")
        #expect(flight.id == "C81 KOSH KDLH")
        #expect(flight.command == .planRoute(dep: "C81", stops: ["KOSH"], dest: "KDLH"))
        #expect(FlightEntity(id: "KMSN").command == nil)
    }

    @Test func aFrequencyIdCarriesWhatItSays() {
        let tower = FrequencyEntity(field: "kmsn", APIFrequency(description: "MADISON TWR", frequencyMhz: 119.3, type: "TWR"))
        let again = FrequencyEntity(id: tower.id)
        #expect(again.field == "KMSN")
        #expect(again.mhz == tower.mhz)
        #expect(!again.mhz.isEmpty)
        #expect(again.spoken.hasPrefix("KMSN "))
    }

    @Test func aCheckpointIsFoundByItsName() {
        #expect(WaypointEntityQuery.name(of: "cp:Lake Mendota@43.1000,-89.4200") == "Lake Mendota")
        #expect(WaypointEntityQuery.name(of: "GOPHER") == "GOPHER")
        #expect(WaypointEntity(id: "cp:Lake Mendota@43.1000,-89.4200", name: "Lake Mendota", role: "Checkpoint 1").ident == nil)
        #expect(WaypointEntity(id: "KMSN", name: "Dane Co Rgnl", role: "Destination").ident == "KMSN")
    }

    @Test func anApproachIsHeardAsPilotsSayIt() {
        let (words, place) = ApproachEntityQuery.split("ILS 36 at Madison")
        #expect(words == ["ILS", "36"])
        #expect(place == "Madison")
        #expect(ApproachEntityQuery.split("RNAV 18 KMSN").place == "KMSN")
        #expect(ApproachEntityQuery.split("ILS runway 36").place == nil)
        #expect(ApproachEntityQuery.matches("ILS OR LOC RWY 36", ["ILS", "runway", "36"]))
        #expect(ApproachEntityQuery.matches("RNAV (GPS) RWY 18", ["RNAV", "18"]))
        #expect(!ApproachEntityQuery.matches("ILS OR LOC RWY 36", ["ILS", "18"]))
    }

    @Test func anApproachIdPutsItOnTheRoute() {
        let approach = ApproachEntity(id: "KMSN|I36|ILS OR LOC RWY 36")
        #expect(approach.pick == ProcedurePick(ident: "KMSN", id: "I36", kind: "approach", name: "ILS OR LOC RWY 36", transition: nil))
        #expect(ApproachEntity(pick: approach.pick).id == approach.id)
    }

    @Test func aCameraLookUpReadsIdentsNotRunways() {
        let lines = ["METAR KMSN 091853Z 27012KT 10SM", "RWY 27-9", "C81 CAMPBELL", "KNOW THE"]
        #expect(VisualRead.idents(in: lines) == ["KMSN", "C81", "KNOW"])
        #expect(!VisualRead.isIdent("27"))
        #expect(!VisualRead.isIdent("RWY"))
        #expect(VisualRead.isIdent("PHNL"))
    }

    @Test func aNotamIsExplainedByTheEnginesReasonsWithoutTheModel() async {
        struct NoModel: WordsProvider {
            func words(_ ask: WordsAsk) async throws -> Words { throw WordsUnavailable(why: "Apple Intelligence is off in Settings.") }
        }
        let reasons = [APINotamReason(key: "runway", words: "It closes runway 18/36 at your destination")]
        let figures = NotamWords.figures(id: "1/2345", raw: "!MSN 1/2345 MSN RWY 18/36 CLSD", reasons: reasons, flight: nil)
        #expect(figures.map(\.id) == ["notam:1/2345", "why:runway"])
        let said = await NotamWords.said(figures, reasons: reasons, device: NoModel())
        #expect(said.text == "It closes runway 18/36 at your destination.")
        #expect(said.origin == AskOrigin.engine.caption)
        let unranked = await NotamWords.said(figures, reasons: [], device: NoModel())
        #expect(unranked.origin == "As sent")
    }

    @Test func anAirplaneSaidIsItsNNumber() async throws {
        let found = try await AirplaneEntityQuery().entities(matching: "n123ab")
        #expect(found.first?.id == "N123AB")
        let none = try await AirplaneEntityQuery().entities(matching: "the cessna")
        #expect(none.isEmpty)
    }
}
