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

    @Test func aTimeIsMonthDayClockAndTheFieldsZone() throws {
        let at = try #require(FieldNotamWords.date("2026-05-27T18:43:00Z"))
        let chicago = try #require(TimeZone(identifier: "America/Chicago"))
        #expect(FieldNotamWords.when(at, zone: chicago, year: true) == "05/27/26 13:43 CDT")
        #expect(FieldNotamWords.when(at, zone: chicago, year: false) == "05/27 13:43 CDT")
        // No zone known: UTC, said so, never "local" or a Z.
        #expect(FieldNotamWords.when(at, zone: nil, year: false) == "05/27 18:43 UTC")
        #expect(FieldNotamWords.when(at, zone: chicago, year: true, clock: false) == "05/27/26")
        // A feed's time with no zone is UTC: the same instant as with its Z.
        #expect(FieldNotamWords.date("2026-11-10T06:00:00") == FieldNotamWords.date("2026-11-10T06:00:00Z"))
    }

    @Test func oneInForceSaysSinceAndEndsWithHowLongIsLeft() throws {
        let now = try #require(FieldNotamWords.date("2026-11-11T06:00:00Z"))
        let lines = FieldNotamWords.timeLines(notam("x", starts: "2026-11-10T06:00:00Z", ends: "2026-11-11T06:05:00Z"), read: reading(estimated: true),
                                              untilCharts: false, zone: nil, now: now)
        // An EST end is its time alone.
        #expect(lines == [.init(label: "Since", value: "11/10 06:00 UTC"), .init(label: "Ends", value: "11/11 06:05 UTC", soon: "in 5m")])
    }

    @Test func oneToComeSaysStartsHowSoonAndHowLong() throws {
        let now = try #require(FieldNotamWords.date("2026-11-10T00:00:00Z"))
        let lines = FieldNotamWords.timeLines(notam("x", inForce: false, starts: "2026-11-10T06:00:00Z", ends: "2026-11-10T11:45:00Z"), read: reading(),
                                              untilCharts: false, zone: nil, now: now)
        #expect(lines == [.init(label: "Starts", value: "11/10 06:00 UTC", soon: "in 6h00m"), .init(label: "Ends", value: "11/10 11:45 UTC", soon: "in 11h45m"),
                          .init(label: "Duration", value: "5h45m")])
    }

    @Test func aPermanentOneEndsPermanent() throws {
        let lines = FieldNotamWords.timeLines(notam("x", starts: "2026-01-01T00:00:00Z"), read: reading(permanent: true), untilCharts: false,
                                              zone: nil, now: try #require(FieldNotamWords.date("2026-06-01T00:00:00Z")))
        #expect(lines == [.init(label: "Since", value: "01/01 00:00 UTC"), .init(label: "Ends", value: "Permanent")])
    }

    /// FDC 6/3373 (the r7 audit's I-H1): a permanent condition with an EST
    /// end the engine reads as until the charts are updated ends
    /// "Permanent" on its row as on its card, never the EST date.
    @Test func oneUntilTheChartsEndsPermanentNotItsEstimate() throws {
        let now = try #require(FieldNotamWords.date("2026-11-23T00:00:00Z"))
        let lines = FieldNotamWords.timeLines(notam("x", starts: "2026-05-27T18:43:00Z", ends: "2028-05-27T18:43:00Z"),
                                              read: reading(estimated: true, permanent: true), untilCharts: true, zone: nil, now: now)
        #expect(lines == [.init(label: "Since", value: "05/27/26 18:43 UTC"), .init(label: "Ends", value: "Permanent")])
    }

    /// The year is counted in the zone the date is shown in: 23:30 on 12/31
    /// in Chicago is 05:30 UTC the next day, still this year's there.
    @Test func theYearIsCountedInTheShownZone() throws {
        let chicago = try #require(TimeZone(identifier: "America/Chicago"))
        let now = try #require(FieldNotamWords.date("2026-12-31T12:00:00Z"))
        let lateTonight = try #require(FieldNotamWords.date("2027-01-01T05:30:00Z"))
        #expect(!FieldNotamWords.withYear([lateTonight], now: now, zone: chicago))
        #expect(FieldNotamWords.withYear([lateTonight], now: now))
    }

    @Test func theNumberLosesTheFieldsOwnName() throws {
        #expect(try FieldNotamWords.idents("KORD") == ["KORD", "ORD"])
        #expect(FieldNotamWords.number(notam("x", id: "ORD 11/439"), idents: try FieldNotamWords.idents("KORD")) == "11/439")
        #expect(FieldNotamWords.number(notam("x", id: "FDC 6/2478"), idents: try FieldNotamWords.idents("KSJT")) == "FDC 6/2478")
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

    @Test func aClosureInForceMarksItsRunwayAndOneToComeNothing() throws {
        let place = AirportPlace(frequencies: [], ident: "KORD", kind: "large_airport", lat: 41.98, lon: -87.9, name: "Chicago O'Hare Intl",
                                 runways: [Runway(closed: false, ends: "04L/22R", lengthFt: 7500, lighted: true),
                                           Runway(closed: false, ends: "10L/28R", lengthFt: 13000, lighted: true)],
                                 towered: true)
        // Read as the planner reads it for the card (app.notam_reading's
        // notam_subject with the card's runways), sent as its `subject`.
        func read(_ raw: String, id: String = "ORD 11/439", inForce: Bool = true) throws -> APIRankedNotam {
            var one = notam(raw, id: id, inForce: inForce)
            one.subject = try Engine.recoded(Engine.notamSubject(text: raw, idents: try FieldNotamWords.idents("KORD"),
                                                                 runways: place.runways.map { $0.ends ?? "" }))
            return one
        }
        let closed = try read("!ORD 11/439 ORD RWY 04L/22R CLSD 2611100600-2611301200")
        let marks = FieldNotamWords.marks([closed], place: place)
        #expect(marks.runway[0]?.unusable == true)
        #expect(marks.runway[0]?.notams.map(\.id) == ["ORD 11/439"])
        #expect(marks.runway[1] == nil)
        let later = try read("!ORD 11/440 ORD RWY 04L/22R CLSD 2612100600-2612301200", id: "ORD 11/440", inForce: false)
        #expect(FieldNotamWords.marks([later], place: place).runway.isEmpty)
        // Sent unread, it marks nothing: the phone reads no NOTAM itself.
        #expect(FieldNotamWords.marks([notam(closed.raw)], place: place).runway.isEmpty)
    }

    /// The web's notamCoverage cases (decision 0059): from when, and that the
    /// list is not the full set, until the planner holds every NOTAM in force.
    @Test func theCoverageSaysTheListIsNotTheFullSet() {
        #expect(NotamCoverage.line(since: "2026-10-19", full: false) == "NOTAMs heard since 19 Oct 2026, not a full set")
        #expect(NotamCoverage.line(since: "2026-11-10T06:00:00Z", full: false) == "NOTAMs heard since 10 Nov 2026, not a full set")
        #expect(NotamCoverage.line(since: nil, full: false) == "Recent NOTAMs only, not a full set")
        #expect(NotamCoverage.line(since: "2026-10-19", full: true) == "FAA NOTAM System, every NOTAM in force")
        #expect(NotamCoverage.none(since: "2026-10-19", full: false) == "None heard since 19 Oct")
        #expect(NotamCoverage.none(since: nil, full: false) == "None heard")
        #expect(NotamCoverage.none(since: "2026-10-19", full: true) == "None in force")
    }
}
