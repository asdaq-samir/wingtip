import Foundation
import Testing
@testable import Wingtip

/// Where a tapped alert leads and the fix it offers: an alert ahead to
/// the airspace card at its point, a copilot message to the field its id
/// names, and Direct To only where the engine picked a field; and the
/// figure a frequency's Copy takes from its words.
struct AlertActionsTests {
    static func message(id: String, kind: String, alternative: String? = nil) -> Copilot.Message {
        Copilot.Message(id: id, kind: kind, level: "caution", title: "", say: "", detail: [], sources: [], elsewhere: false,
                        alternative: alternative.map {
                            EngineContract.CopilotAlternative(ident: $0, lat: 47.4, lon: -92.9, distanceNm: 18, courseDeg: 300,
                                                              fuel: true, reserveMin: 30, private: false, military: nil, reasons: [])
                        })
    }

    @Test func anAlertAheadOpensTheAirspaceWhereItIs() {
        let alert = AheadAlert(distanceNm: 3.4, id: "special_use:R-4305", kind: "special_use", lat: 46.9, level: "warning", lon: -92.4,
                               name: "R-4305", need: "Restricted", seconds: 180)
        #expect(AlertActions.target(alert) == .place(lat: 46.9, lon: -92.4))
        #expect(AlertActions.target(alert).route == AirportRoute.airspace(lat: 46.9, lon: -92.4).text)
    }

    @Test func aCopilotMessageOpensTheFieldItsIdNames() {
        #expect(AlertActions.target(Self.message(id: "weather:KDLH:ifr", kind: "weather")) == .field("KDLH"))
        #expect(AlertActions.target(Self.message(id: "itws:KORD:Microburst alert: 30 kt loss", kind: "itws")) == .field("KORD"))
        #expect(AlertActions.target(Self.message(id: "night:KHIB", kind: "night")) == .field("KHIB"))
        // A destination NASR lists as closed opens its own card, labelled so;
        // its fix is the engine's alternative (decision 0043).
        let closed = Self.message(id: "closed:00MO", kind: "closed", alternative: "KMBY")
        #expect(AlertActions.target(closed) == .field("00MO") && AlertActions.fix(closed) == .directTo("KMBY"))
        #expect(AlertActions.target(Self.message(id: "groundspeed:10", kind: "groundspeed")) == nil)
        #expect(AlertActions.target(Self.message(id: "tfr:FDC 6/1234", kind: "tfr", alternative: "KHIB")) == .field("KHIB"))
    }

    @Test func theFixIsDirectToTheEnginesPickAlone() {
        #expect(AlertActions.fix(Self.message(id: "fuel:KDLH", kind: "fuel", alternative: "KHIB")) == .directTo("KHIB"))
        #expect(AlertActions.fix(Self.message(id: "fuel:KDLH", kind: "fuel", alternative: "KHIB"))?.label == "Direct To KHIB")
        #expect(AlertActions.fix(Self.message(id: "weather:KDLH:ifr", kind: "weather")) == nil)
    }

    @Test func aFrequencysCopyTakesTheFigureAlone() {
        #expect(FrequencyCopy.figure(in: "Tower 118.3") == "118.3")
        #expect(FrequencyCopy.figure(in: "AWOS 119.025") == "119.025")
        #expect(FrequencyCopy.figure(in: "CTAF") == nil)
    }
}
