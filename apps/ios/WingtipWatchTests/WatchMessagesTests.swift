import Foundation
import Testing
@testable import WingtipWatch

/// The messages the phone and the watch pass (Wingtip/Shared/
/// WatchMessages.swift) read back as they were written, dates included,
/// and the checklist reads from the gateway's own JSON (ChecklistDto),
/// which is what the phone sends.
struct WatchMessagesTests {
    @Test func aContextAndANearestReplyRoundTrip() throws {
        let at = Date(timeIntervalSince1970: 1_762_128_000)
        let checklist = WatchChecklist(sections: [
            WatchChecklistSection(title: "Before Takeoff", items: [
                WatchChecklistItem(challenge: "Fuel selector", response: "Both"),
                WatchChecklistItem(challenge: "Flaps", response: nil),
            ]),
        ])
        let context = WatchContext(tail: "N3429J", checklist: checklist, fix: WatchFix(lat: 42.32, lon: -88.07, altitudeFt: 2500, trackDeg: 270, groundspeedKt: 105, at: at), sentAt: at)
        let again = try WatchCoding.decoder.decode(WatchContext.self, from: WatchCoding.encoder.encode(context))
        #expect(again == context)

        let reply = NearestReply(airports: [WatchAirport(ident: "C81", name: "Campbell", lat: 42.32, lon: -88.07, distanceNm: 1.4, bearingDeg: 93, flightCategory: "VFR")], problem: nil)
        let replyAgain = try WatchCoding.decoder.decode(NearestReply.self, from: WatchCoding.encoder.encode(reply))
        #expect(replyAgain == reply)

        let request = try WatchCoding.decoder.decode(NearestRequest.self, from: WatchCoding.encoder.encode(NearestRequest(lat: 1, lon: 2)))
        #expect(request.limit == 8)
    }

    /// North is 360, never 000 (FAA Order JO 7110.65, 2-4-17), including
    /// a bearing that rounds to it from either side.
    @Test func aBearingNorthIs360() {
        func words(_ deg: Double) -> String {
            WatchAirport(ident: "C81", name: "Campbell", lat: 0, lon: 0, distanceNm: 1, bearingDeg: deg, flightCategory: nil).bearingWords
        }
        #expect(words(0) == "360°")
        #expect(words(0.4) == "360°")
        #expect(words(359.6) == "360°")
        #expect(words(360) == "360°")
        #expect(words(5) == "005°")
        #expect(words(93) == "093°")
        #expect(words(359.4) == "359°")
    }

    @Test func theGatewaysChecklistJSONReadsAsTheWatchs() throws {
        let json = #"{"sections":[{"title":"Checklist","items":[{"challenge":"Mixture","response":"Rich"},{"challenge":"Lights","response":null}]}]}"#
        let checklist = try JSONDecoder().decode(WatchChecklist.self, from: Data(json.utf8))
        #expect(checklist.sections[0].items[0].response == "Rich" && checklist.sections[0].items[1].response == nil)
    }
}
