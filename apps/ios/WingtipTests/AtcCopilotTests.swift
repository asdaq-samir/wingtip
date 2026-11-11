import Foundation
import Testing
@testable import Wingtip

/// The ATC copilot: a call to us read by the engine into its items
/// (atc_call), each item in words, and our readback after it checked
/// (readback_check), with the shared fixture's calls (atcCalls.json).
@MainActor
struct AtcCopilotTests {
    private let tail = "N123AB"
    private let call = "Cessna one two three alpha bravo, turn left heading two seven zero, descend and maintain three thousand, Chicago altimeter two niner niner two"

    @Test func aCallToUsMakesACardOfItsItems() throws {
        let at = Date(timeIntervalSince1970: 1_000)
        let cards = try AtcCopilot.heardInto([], id: 1, text: call, at: at, tail: tail)
        let card = try #require(cards.first)
        #expect(card.items.map(\.kind) == ["heading", "altitude", "altimeter"])
        // Altitudes as ATC says them (the engine's altitude_said: 4,500 ft
        // is "4,500 ft"), headings in three figures (AIM 4-2-10).
        #expect(card.items.map(\.words) == ["Left heading 270", "Descend 3,000 ft", "Altimeter 29.92"])
        // Someone else's call makes no card.
        let other = try AtcCopilot.heardInto(cards, id: 2, text: "Skyhawk four five six, contact tower one one eight point three", at: at.addingTimeInterval(5), tail: tail)
        #expect(other.count == 1)
    }

    @Test func ourReadbackIsCheckedAgainstTheCall() throws {
        let at = Date(timeIntervalSince1970: 1_000)
        let cards = try AtcCopilot.heardInto([], id: 1, text: call, at: at, tail: tail)
        let read = try AtcCopilot.heardInto(cards, id: 2, text: "left heading two seven zero, descend and maintain three thousand, two niner niner two, Cessna three alpha bravo",
                                            at: at.addingTimeInterval(4), tail: tail)
        let check = try #require(read.first?.readback?.check)
        #expect(AtcCopilot.readbackLines(check) == ["Readback complete"])
    }

    @Test func itemsInWords() throws {
        let json = #"[{"kind":"squawk","code":"4512"},{"kind":"frequency","mhz":"125.35","facility":"approach"},{"kind":"direct","said":"gopher"},{"kind":"hold","fix":"gopher","direction":"northeast","on":"radial","on_deg":45,"turns":"left","published":false,"efc":"1430"},{"kind":"runway","runway":"27","what":"land"},{"kind":"class_b"}]"#
        // The contract's items, decoded by its generated type.
        let items = try JSONDecoder().decode([AtcItem].self, from: Data(json.utf8))
        #expect(items.map(\.words) == [
            "Squawk 4512", "Approach 125.35", "Direct GOPHER", "Hold NE of GOPHER, 045 radial, left turns, EFC 1430Z",
            "Runway 27, cleared to land", "Cleared into Class B",
        ])
    }
}
