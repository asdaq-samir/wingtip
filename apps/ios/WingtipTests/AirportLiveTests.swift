import Foundation
import Testing
@testable import Wingtip

/// The airport card's live reports as the planner sends them, read by
/// the engine and written as the web writes them (lib/liveReports,
/// lib/rvrRows, lib/departureWords).
@MainActor
struct AirportLiveTests {
    private func decode<T: Decodable>(_ type: T.Type, _ json: String) throws -> T {
        try Planner.json.decode(T.self, from: Data(json.utf8))
    }

    @Test func aDigitalAtisIsReadByTheEngineIntoItsFigures() throws {
        let json = #"{"airport":"KORD","broadcasts":[{"airport":"KORD","heard":1762700000,"issued":"091351","letter":"K","reading":{},"text":"ORD INFO K 1351Z. 27015G25KT 3SM BR OVC008 M02/M04 A2992. ILS RWY 27L APCH IN USE. DEPG RWY 28R.","which":"arrival"}]}"#
        let shown = AirportLive.broadcasts(try decode(AirportDatis.self, json))
        #expect(shown.count == 1)
        #expect(shown[0].title == "Arrival D-ATIS, Information K")
        let reading = try #require(shown[0].reading)
        #expect(reading.information == "K" && reading.altimeterInhg == 29.92)
        #expect(reading.wind?.fromDeg == 270 && reading.wind?.gustKt == 25)
        #expect(reading.rows.contains { $0.label == "Altimeter" && $0.value == "29.92 inHg" })
        #expect(LiveWords.datisTitle(which: nil, letter: nil) == "D-ATIS")
    }

    @Test func rvrIsJudgedByTheEngineAgainstTheMinimum() throws {
        let json = #"{"airport":"KORD","runways":[{"airport":"KORD","heard":1,"runway":"27L","touchdown_ft":1800,"midpoint_ft":2200,"rollout_ft":6000,"rollout_more":true},{"airport":"KORD","heard":1,"runway":"28R","touchdown_ft":6000,"touchdown_more":true}]}"#
        let rvr = try decode(AirportRvr.self, json)
        // 1/2 SM pairs with 2,400 ft (14 CFR 91.175(h)(2)); the lowest
        // reading, 1,800 ft, is under it.
        let rows = try LiveWords.rvrRows(rvr.runways, minimumSm: 0.5)
        #expect(rows[0].readings == "1800 · 2200 · 6000+")
        #expect(rows[0].under == "Under your 1/2 SM minimum (14 CFR 91.175(h))")
        #expect(rows[1].readings == "6000+ · — · —" && rows[1].under == nil)
        // No minimum, nothing judged.
        #expect(try LiveWords.rvrRows(rvr.runways, minimumSm: nil).allSatisfy { $0.under == nil })
        #expect(LiveWords.smWords(1.25) == "1 1/4" && LiveWords.smWords(0.625) == "5/8" && LiveWords.smWords(3) == "3")
    }

    @Test func programsAreLinesAndRestrictionsAreNot() throws {
        let json = #"{"programs":[{"airport":"EWR","heard":1,"program":"ground stop","ends":1762723800,"average_delay_min":45},{"airport":"EWR","heard":1,"restriction":true,"kind":"ARRIVAL","value":"15 MIT"}]}"#
        let programs = try decode(APIFlowAtAirports.self, json).programs
        // 1762723800 is 2130Z on 9 November 2025.
        #expect(LiveWords.programLines(programs) == ["Ground stop at EWR until 2130Z, delays average 45 min"])
        #expect(LiveWords.idents(["kewr", " KEWR", nil, ""]) == ["KEWR"])
    }

    @Test func specialUseStatusAndTowerDepartureInWords() throws {
        let saa = try decode(APISaaStatuses.self, #"{"areas":{"R-4305":{"designator":"R-4305","active":true,"until":1762723800,"heard":1},"MOA":{"designator":"MOA","active":false,"next":1762696800,"heard":1},"W-1":{"designator":"W-1","active":null,"heard":1}}}"#).areas.additionalProperties
        #expect(LiveWords.saaBadge(saa["R-4305"])?.status == .active)
        #expect(LiveWords.saaBadge(saa["R-4305"])?.rest == "until 2130Z (FAA SFDPS)")
        #expect(LiveWords.saaBadge(saa["MOA"])?.status == .cold)
        #expect(LiveWords.saaBadge(saa["MOA"])?.rest == "next active 1400Z (FAA SFDPS)")
        #expect(LiveWords.saaBadge(saa["W-1"]) == nil && LiveWords.saaBadge(nil) == nil)
        let events = try decode(APIDepartureEvents.self, #"{"events":[{"ident":"AAL123","heard":1,"departure":"KIND","destination":"KRSW","gate":"B20","times":{"clearance_delivery":1762664220}}]}"#).events
        #expect(LiveWords.departureLine(events.first) == "Cleared 0457Z at KIND, gate B20, to KRSW (FAA TDES)")
        #expect(LiveWords.departureLine(DepartureEvent(heard: 1, ident: "N1")) == "Departure event (FAA TDES)")
    }
}
