import Foundation
import Testing
@testable import Wingtip

/// The wave's links and the one search's airplanes: a TFR's and a VOR's
/// card by their links (`tfr=`, `navaid=`, the web's address), a VOR's
/// key, a TFR in force, the airplanes the map hears found by what is typed,
/// and Show Traffic in Do.
@MainActor
struct CardLinksTests {
    @Test func aTfrsLinkOpensItsCard() throws {
        let url = try #require(URL(string: "https://wingtipmaps.app/app/plan?tfr=6/4116"))
        #expect(Links.command(for: url) == .card(.tfr("6/4116")))
        let bad = try #require(URL(string: "https://wingtipmaps.app/app/plan?tfr=KDLH"))
        #expect(Links.command(for: bad) != .card(.tfr("KDLH")))
    }

    @Test func aVorsLinkOpensItsCardByItsIdentAndPlace() throws {
        let url = try #require(URL(string: "https://wingtipmaps.app/app/plan?navaid=OBK@42.2214,-87.9517"))
        #expect(Links.command(for: url) == .card(.navaid("OBK@42.2214,-87.9517")))
        #expect(NavaidKey("OBK@42.2214,-87.9517") == NavaidKey(ident: "OBK", lat: 42.2214, lon: -87.9517))
        #expect(NavaidKey(ident: "OBK", lat: 42.22144, lon: -87.95166).text == "OBK@42.2214,-87.9517")
        #expect(NavaidKey("OBK") == nil && NavaidKey("obk@1,2") == nil && NavaidKey("OBK@95,0") == nil)
    }

    @Test func aTfrIsInForceBetweenItsStartAndItsEnd() throws {
        let json = #"{"notam_id":"6/4116","kind":"Security","effective":"2026-11-14T18:00:00Z","expires":"2026-11-14T22:00:00Z","geometry":{}}"#
        let tfr = try Planner.json.decode(APITfr.self, from: Data(json.utf8))
        let at = { (s: String) in try! Date(s, strategy: .iso8601) }
        #expect(!TfrCard.active(tfr, now: at("2026-11-14T17:59:00Z")))
        #expect(TfrCard.active(tfr, now: at("2026-11-14T20:00:00Z")))
        #expect(!TfrCard.active(tfr, now: at("2026-11-14T22:00:00Z")))
    }

    @Test func theOneSearchFindsTheAirplanesHeard() {
        let planes = [
            TrafficAircraft(callsign: "UAL2088", hex: "a93f1e", lat: 0, lon: 0),
            TrafficAircraft(hex: "a128b9", lat: 0, lon: 0, registration: "N174HA"),
        ]
        #expect(AirplaneHits.heard("ual", in: planes).map(\.hex) == ["a93f1e"])
        #expect(AirplaneHits.heard("N174", in: planes).map(\.hex) == ["a128b9"])
        #expect(AirplaneHits.heard("A12", in: planes).map(\.hex) == ["a128b9"])
        // Two letters are not enough to ask by.
        #expect(AirplaneHits.heard("UA", in: planes).isEmpty)
    }

    @Test func showTrafficIsOfferedForTraffic() {
        #expect(SearchActions.list(for: "traffic", routed: false, firstIdent: nil).contains(.showTraffic))
        #expect(SearchActions.list(for: "show tr", routed: false, firstIdent: nil).contains(.showTraffic))
        #expect(!SearchActions.list(for: "KDLH", routed: false, firstIdent: nil).contains(.showTraffic))
    }

    @Test func eachStatusSaysItsWord() {
        #expect(BadgeStatus.active.word == "Active")
        #expect(BadgeStatus.outOfService.word == "Out of service")
        #expect(BadgeStatus.joint.word == "Joint use")
        #expect(FieldUse.flag(closed: nil, use: "military") == FieldUse.Flag(words: "Military", status: .military))
        #expect(FieldUse.flag(closed: "Closed indefinitely", use: "private")?.status == .closed)
    }
}
