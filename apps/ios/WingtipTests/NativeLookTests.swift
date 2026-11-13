import CoreLocation
import Testing
@testable import Wingtip

/// The parts the native-look pass added that hold logic of their own: the
/// NOTAM list's scopes, sorts and sections, the airport card's distance
/// (always shown, the engine's miles), the NOTAM pages as a scene keeps
/// them, and the airplane's endurance (the engine's, after each reserve).
@MainActor
struct NativeLookTests {
    private func notam(_ id: String, rank: Int, kind: String = "notam", field: String? = "KOSH", role: String? = "dest",
                       keyword: String? = "RWY", starts: String? = nil, inForce: Bool? = nil) -> APIRankedNotam {
        APIRankedNotam(closed: false, ends: nil, field: kind == "tfr" ? nil : field, highFt: nil, id: id, inForce: inForce, keyword: keyword,
                       kind: kind, lowFt: nil, rank: rank, raw: "!OSH 11/001 OSH RWY 09/27 CLSD", reasons: [], role: kind == "tfr" ? nil : role,
                       runways: [], score: 10, starts: starts, tied: false, top: rank == 1)
    }

    @Test func everyNotamShowsInTheEnginesOrder() {
        // No search, scope or sort: the app keeps one search (the owner,
        // 2026-11-13), and the order is the engine's rank.
        let all = [notam("c", rank: 3), notam("t", rank: 4, kind: "tfr"), notam("a", rank: 1, role: "dep"), notam("b", rank: 2, role: "stop")]
        #expect(NotamRows.inOrder(all).map(\.id) == ["a", "b", "c", "t"])
    }

    @Test func sectionsGoByPlaceWithTfrsTogether() {
        let all = [notam("a", rank: 1, field: "KMSN"), notam("t", rank: 2, kind: "tfr"), notam("b", rank: 3, field: "KOSH"), notam("c", rank: 4, field: "KMSN")]
        let places = NotamRows.places(all, source: .route)
        #expect(places.map(\.title) == ["KMSN", "TFRs", "KOSH"])
        #expect(places.first?.notams.map(\.id) == ["a", "c"])
    }

    @Test func aRowSaysWhenInZuluAndDropsTheHead() {
        #expect(NotamRows.when(notam("a", rank: 1, starts: "2026-11-09T14:00:00Z")) == "From 1400Z")
        #expect(NotamRows.when(notam("a", rank: 1, inForce: true)) == "In effect now")
        #expect(!NotamRows.summary(notam("a", rank: 1)).hasPrefix("!OSH"))
        #expect(NotamRows.kind(notam("t", rank: 1, kind: "tfr")) == "TFR")
    }

    @Test func notamPagesAreKeptByTheScene() {
        #expect(SheetPage(stored: "+notams") == .notams(.route))
        #expect(SheetPage(stored: "+notams:KOSH") == .notams(.field("KOSH")))
        #expect(SheetPage.notams(.field("KOSH")).stored == "+notams:KOSH")
        #expect(SheetPage(stored: "+notams:") == nil)
    }

    @Test func distanceIsFromTheAirplaneElseFromTheDeparture() throws {
        let oshkosh = (lat: 43.9844, lon: -88.5570)
        let madison = CourseEnd(airspaceClass: "C", elevationFt: 887, ident: "KMSN", kind: nil, lat: 43.1399, lon: -89.3375, name: "Dane County Regional",
                                patternAltitudeFt: nil)
        let fromDeparture = try #require(try AirportDistance.of(lat: oshkosh.lat, lon: oshkosh.lon, ident: "KOSH", fix: nil, departure: madison))
        #expect(fromDeparture.from == "KMSN")
        #expect(fromDeparture.caption == "From KMSN")
        #expect((60...64).contains(fromDeparture.nm))
        let fix = CLLocationCoordinate2D(latitude: 43.9844, longitude: -88.0)
        let fromHere = try #require(try AirportDistance.of(lat: oshkosh.lat, lon: oshkosh.lon, ident: "KOSH", fix: fix, departure: madison))
        #expect(fromHere.from == nil)
        #expect(fromHere.caption == "Distance")
        // The departure's own card has no distance from itself.
        #expect(try AirportDistance.of(lat: madison.lat, lon: madison.lon, ident: "KMSN", fix: nil, departure: madison) == nil)
    }

    @Test func enduranceIsTheEnginesAfterEachReserveAndNeverAssumed() throws {
        let day = try Engine.endurance(usableGal: 50, burnGph: 10, reserve: EnduranceReserve.vfrDay.rawValue)
        #expect(day.minutes == 300)
        #expect(day.afterReserveMin == 270)
        let ifr = try Engine.endurance(usableGal: 50, burnGph: 10, reserve: EnduranceReserve.ifr.rawValue)
        #expect(ifr.afterReserveMin == 255)
        let short = try Engine.endurance(usableGal: 5, burnGph: 10, reserve: EnduranceReserve.vfrNight.rawValue)
        #expect(short.belowReserve)
        #expect(short.afterReserveMin == 0)
        let none = try Engine.endurance(usableGal: nil, burnGph: 10, reserve: EnduranceReserve.vfrDay.rawValue)
        #expect(none.minutes == nil)
    }

    @Test func aTafIsCutAtItsChangeGroupsWordForWord() {
        let taf = "KOSH 091720Z 0918/1018 27012G20KT P6SM SCT050 FM100200 30008KT P6SM BKN035 TEMPO 1004/1008 3SM -SHRA BKN020 PROB30 1010/1014 OVC008"
        let periods = TafStrip.periods(taf)
        #expect(periods.count == 4)
        #expect(periods[1].hasPrefix("FM100200 "))
        #expect(periods[2].hasPrefix("TEMPO "))
        #expect(periods[3].hasPrefix("PROB30 "))
        #expect(periods.joined(separator: " ") == taf)
    }
}
