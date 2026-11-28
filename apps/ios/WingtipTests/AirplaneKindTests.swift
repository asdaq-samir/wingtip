import Foundation
import Testing
@testable import Wingtip

/// What the logbook says of an airplane's category, class and gear
/// (AirplaneKind, 14 CFR 61.57(a)(1)), as Android's AirplaneKindTest: the
/// newest entry of the same N-number that says each, never a guess.
struct AirplaneKindTests {
    static func entry(_ id: Int, on day: String, aircraft: String?, category: String? = nil, aircraftClass: String? = nil,
                      tailwheel: Bool? = nil) -> LogbookEntry {
        var e = LogbookEntriesModelTests.entry(id)
        e.flownOn = day
        e.aircraft = aircraft
        e.category = category
        e.aircraftClass = aircraftClass
        e.tailwheel = tailwheel
        return e
    }

    @Test func eachColumnIsTheNewestThatSaysItForThatNNumber() throws {
        let entries = [
            Self.entry(1, on: "2026-11-01", aircraft: "N3429J", category: "airplane", aircraftClass: "single-engine land", tailwheel: false),
            Self.entry(2, on: "2026-11-20", aircraft: "n3429j ", tailwheel: true),
            Self.entry(3, on: "2026-11-25", aircraft: "N12345", category: "airplane", aircraftClass: "multiengine land"),
        ]
        let kind = try #require(AirplaneKind.of(entries, tail: "N3429J"))
        #expect(kind == AirplaneKind(category: "airplane", aircraftClass: "single-engine land", tailwheel: true))
        #expect(AirplaneKind.of(entries, tail: "N999ZZ") == nil)
        #expect(AirplaneKind.of(entries, tail: nil) == nil)
        #expect(AirplaneKind.of([Self.entry(4, on: "2026-11-26", aircraft: "N3429J")], tail: "N3429J") == nil)
    }

    @Test func aNewFlightTakesTheLogbooksAndAnEditKeepsItsOwn() {
        let entries = [Self.entry(1, on: "2026-11-01", aircraft: "N3429J", category: "airplane", aircraftClass: "single-engine land", tailwheel: false)]
        let blank = LogbookEntryRequest.blank(aircraft: "N3429J", entries: entries)
        #expect(blank.category == "airplane" && blank.aircraftClass == "single-engine land" && blank.tailwheel == false)
        #expect(blank.fullStopLandings == nil)
        let unknown = LogbookEntryRequest.blank(aircraft: "N999ZZ", entries: entries)
        #expect(unknown.category == nil && unknown.aircraftClass == nil && unknown.tailwheel == nil)
        var e = entries[0]
        e.fullStopLandings = 2
        let edited = LogbookEntryRequest(e)
        #expect(edited.category == "airplane" && edited.tailwheel == false && edited.fullStopLandings == 2)
    }
}
