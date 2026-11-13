import Foundation
import Testing
@testable import Wingtip

/// The airport card's NOTAMs as the web's card writes them (fieldNotams,
/// notamTimes, notamBadges; their vitest cases): the time lines, the
/// number off the field's name, the words in red, and the badges the
/// engine puts on what a NOTAM in force addresses.
@MainActor
@Suite struct FieldNotamsTests {
    private let utc = TimeZone(identifier: "UTC")!

    private func notam(_ raw: String, id: String = "ORD 11/439", inForce: Bool? = true, starts: String? = nil, ends: String? = nil,
                       kind: String = "notam") -> APIRankedNotam {
        APIRankedNotam(closed: false, ends: ends, field: "KORD", highFt: nil, id: id, inForce: inForce, keyword: nil, kind: kind, lowFt: nil,
                       rank: 1, raw: raw, reasons: [], role: nil, runways: [], score: 10, starts: starts, tied: false, top: true)
    }

    private func reading(estimated: Bool = false, permanent: Bool = false) -> EngineContract.NotamReadAnswer {
        EngineContract.NotamReadAnswer(form: "domestic", number: nil, location: nil, keyword: nil, heading: nil, title: nil, what: nil,
                                       where: nil, words: "", starts: nil, ends: nil, estimated: estimated, permanent: permanent)
    }

    @Test func spansAreWrittenAsForeFlightWritesThem() {
        #expect(FieldNotamWords.span(5 * 60) == "5m")
        #expect(FieldNotamWords.span((5 * 60 + 5) * 60) == "5h05m")
        #expect(FieldNotamWords.span((4 * 24 + 16) * 3600) == "4d16h")
        #expect(FieldNotamWords.span(2 * 86400) == "2d")
        #expect(FieldNotamWords.span(18 * 86400 + 3600) == "18d")
    }

    @Test func aCornerIsMonthDayAnd24HourClock() throws {
        let at = try #require(FieldNotamWords.date("2026-11-10T06:00:00Z"))
        #expect(FieldNotamWords.corner(at, local: false, in: utc) == "11/10 06:00")
        #expect(FieldNotamWords.corner(at, local: true, in: utc) == "11/10 06:00 local")
        // A feed's time with no zone is UTC.
        #expect(FieldNotamWords.date("2026-11-10T06:00:00") == at)
    }

    @Test func oneInForceSaysSinceAndEndsWithHowLongIsLeft() throws {
        let now = try #require(FieldNotamWords.date("2026-11-11T06:00:00Z"))
        let lines = FieldNotamWords.timeLines(notam("x", starts: "2026-11-10T06:00:00Z", ends: "2026-11-11T06:05:00Z"), read: reading(estimated: true),
                                              now: now, in: utc)
        #expect(lines == [.init(label: "Since", value: "11/10 06:00"), .init(label: "Ends", value: "11/11 06:05 local (est.) (in 5m)")])
    }

    @Test func oneToComeSaysStartsHowSoonAndHowLong() throws {
        let now = try #require(FieldNotamWords.date("2026-11-10T00:00:00Z"))
        let lines = FieldNotamWords.timeLines(notam("x", inForce: false, starts: "2026-11-10T06:00:00Z", ends: "2026-11-10T11:45:00Z"), read: reading(),
                                              now: now, in: utc)
        #expect(lines == [.init(label: "Starts", value: "11/10 06:00 (in 6h00m)"), .init(label: "Ends", value: "11/10 11:45 local (in 11h45m)"),
                          .init(label: "Duration", value: "5h45m")])
    }

    @Test func aPermanentOneEndsPermanent() throws {
        let lines = FieldNotamWords.timeLines(notam("x", starts: "2026-01-01T00:00:00Z"), read: reading(permanent: true), now: .now, in: utc)
        #expect(lines == [.init(label: "Since", value: "01/01 00:00 local"), .init(label: "Ends", value: "Permanent")])
    }

    @Test func theNumberLosesTheFieldsOwnName() {
        #expect(FieldNotamWords.idents("KORD") == ["KORD", "ORD"])
        #expect(FieldNotamWords.number(notam("x", id: "ORD 11/439"), ident: "KORD") == "11/439")
        #expect(FieldNotamWords.number(notam("x", id: "FDC 6/2478"), ident: "KSJT") == "FDC 6/2478")
    }

    @Test func onlyClosedAndOutOfServiceAreRed() {
        let marked = NotamWhatText.marked("Runway 04L/22R Closed except taxiing; ILS out of service")
        let red = marked.runs.filter { $0.foregroundColor != nil }.map { String(marked[$0.range].characters) }
        #expect(red == ["Closed", "out of service"])
        #expect(String(marked.characters) == "Runway 04L/22R Closed except taxiing; ILS out of service")
    }

    @Test func theLongestIsAnOpenRunwayAndNoneWithOne() {
        func runway(_ ends: String, _ length: Int, closed: Bool = false) -> Runway {
            Runway(closed: closed, ends: ends, lengthFt: length, lighted: true, runwayEnds: nil, surface: "ASPH", widthFt: 150)
        }
        #expect(AirportRunwaysTab.longest([runway("10L/28R", 13000), runway("04L/22R", 7500)]) == 0)
        #expect(AirportRunwaysTab.longest([runway("10L/28R", 13000, closed: true), runway("04L/22R", 7500), runway("09/27", 5000)]) == 1)
        #expect(AirportRunwaysTab.longest([runway("10L/28R", 13000), runway("04L/22R", 7500, closed: true)]) == nil)
    }

    @Test func aClosureInForceMarksItsRunwayAndOneToComeNothing() {
        let place = AirportPlace(frequencies: [], ident: "KORD", kind: "large_airport", lat: 41.98, lon: -87.9, name: "Chicago O'Hare Intl",
                                 runways: [Runway(closed: false, ends: "04L/22R", lengthFt: 7500, lighted: true),
                                           Runway(closed: false, ends: "10L/28R", lengthFt: 13000, lighted: true)],
                                 towered: true)
        let closed = notam("!ORD 11/439 ORD RWY 04L/22R CLSD 2611100600-2611301200")
        let marks = FieldNotamWords.marks([closed], ident: "KORD", place: place)
        #expect(marks.runway[0]?.unusable == true)
        #expect(marks.runway[0]?.notams.map(\.id) == ["ORD 11/439"])
        #expect(marks.runway[1] == nil)
        let later = notam("!ORD 11/440 ORD RWY 04L/22R CLSD 2612100600-2612301200", id: "ORD 11/440", inForce: false)
        #expect(FieldNotamWords.marks([later], ident: "KORD", place: place).runway.isEmpty)
    }
}
