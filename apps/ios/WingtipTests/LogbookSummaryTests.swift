import Foundation
import Testing
@testable import Wingtip

/// The logbook's summary (LogbookSummary: this month's highlights, the
/// trend's bars from zero, the flights by month and the search) and the
/// coach's trends (CoachTrends: the last 90 days against the year's pace,
/// shown only with enough flights). Sums of what was logged, on fixed
/// days so the tests do not depend on today.
@MainActor
struct LogbookSummaryTests {
    private static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }()

    private static let now = Day.date("2026-11-20")!

    private static func entry(_ id: Int, on day: String, hours: Double = 1.0, landings: Int = 2, approaches: Int = 0,
                              route: String? = "KDLH KHIB", remarks: String? = nil) -> LogbookEntry {
        LogbookEntry(aircraft: "N3429J", aircraftType: "P28A", airHours: hours, approaches: approaches, crossCountryHours: 0, dayLandings: landings,
                     distanceNm: 0, dualHours: 0, flownOn: day, fromTrack: false, holding: false, id: id,
                     instrumentHours: 0, longestLegNm: 0, nightHours: 0, nightLandings: 0, remarks: remarks, route: route, soloHours: 0,
                     totalHours: hours, touchAndGoes: 0, toweredLandings: 0, tracking: false)
    }

    @Test func highlightsAreThisMonthsOwn() {
        let entries = [Self.entry(1, on: "2026-11-02", hours: 1.5, approaches: 2), Self.entry(2, on: "2026-11-15", hours: 0.8),
                       Self.entry(3, on: "2026-10-30", hours: 3)]
        let h = LogbookSummary.highlights(entries, now: Self.now, calendar: Self.calendar)
        #expect(h.flights == 2 && h.landings == 4 && h.approaches == 2)
        #expect(abs(h.hours - 2.3) < 0.0001)
    }

    @Test func theTrendHasABarForEverySpanFromZero() {
        let entries = [Self.entry(1, on: "2026-11-02", hours: 1.5), Self.entry(2, on: "2026-09-10", hours: 2)]
        let bars = LogbookSummary.trend(entries, period: .month, now: Self.now, calendar: Self.calendar)
        #expect(bars.count == 12)
        #expect(bars.last?.hours == 1.5)
        #expect(bars[bars.count - 3].hours == 2)
        #expect(bars.filter { $0.hours == 0 }.count == 10)
        #expect(LogbookSummary.trend(entries, period: .year, now: Self.now, calendar: Self.calendar).last?.hours == 3.5)
    }

    @Test func flightsAreGroupedByMonthNewestFirstAndSearched() {
        let entries = [Self.entry(1, on: "2026-10-30"), Self.entry(2, on: "2026-11-15", route: "KMSN KOSH"),
                       Self.entry(3, on: "2026-11-02", remarks: "Pattern work")]
        let months = LogbookSummary.months(entries, calendar: Self.calendar)
        #expect(months.count == 2)
        #expect(months.first?.entries.map(\.id) == [2, 3])
        #expect(LogbookSummary.months(entries, matching: "kosh", calendar: Self.calendar).flatMap(\.entries).map(\.id) == [2])
        #expect(LogbookSummary.months(entries, matching: "pattern", calendar: Self.calendar).flatMap(\.entries).map(\.id) == [3])
        #expect(LogbookSummary.months(entries, matching: "KJVL", calendar: Self.calendar).isEmpty)
    }

    @Test func coachTrendsWaitForEnoughFlights() {
        let few = (1...3).map { Self.entry($0, on: "2026-11-0\($0)") }
        #expect(CoachTrends.trends(few, now: Self.now, calendar: Self.calendar) == nil)
        #expect(CoachTrends.flightsToGo(few, now: Self.now, calendar: Self.calendar) == 2)
    }

    @Test func coachTrendsCompareTheLast90DaysWithTheYearsPace() throws {
        // Two flights early in the year, four in the last 90 days: ahead.
        let entries = [Self.entry(1, on: "2026-01-10"), Self.entry(2, on: "2026-02-10"),
                       Self.entry(3, on: "2026-09-01"), Self.entry(4, on: "2026-10-01"),
                       Self.entry(5, on: "2026-10-20"), Self.entry(6, on: "2026-11-10", approaches: 3)]
        let trends = try #require(CoachTrends.trends(entries, now: Self.now, calendar: Self.calendar))
        #expect(trends.map(\.title) == ["Hours", "Landings", "Approaches"])
        #expect(trends.allSatisfy { $0.way == .up })
        // All the flying long ago: behind.
        let old = (1...5).map { Self.entry($0, on: "2026-0\($0 + 1)-10") }
        let behind = try #require(CoachTrends.trends(old, now: Self.now, calendar: Self.calendar))
        #expect(behind.first?.way == .down)
        #expect(behind.count == 2)
    }
}
