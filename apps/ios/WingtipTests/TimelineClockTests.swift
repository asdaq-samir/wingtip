import Foundation
import Testing
@testable import Wingtip

/// The clocks FPL's timeline says its times in (TimelineClock): no zone
/// along one zone's route, every point's own once one keeps another, and
/// a departure's time of day as its next time.
struct TimelineClockTests {
    private let chicago = TimeZone(identifier: "America/Chicago")!
    private let denver = TimeZone(identifier: "America/Denver")!
    /// 2026-11-21 17:00Z, 11:00 in Chicago, 10:00 in Denver.
    private let leaves = Date(timeIntervalSince1970: 1_795_280_400)

    private func point(_ index: Int, _ ident: String, _ role: TimelinePoint.Role, minutes: Double?) -> TimelinePoint {
        TimelinePoint(index: index, ident: ident, role: role, field: true, position: false, fuelStop: false, minutes: minutes)
    }

    @Test func oneZoneAlongTheRouteSaysNone() {
        let points = [point(0, "C81", .departure, minutes: 0), point(1, "KMSN", .stop, minutes: 60), point(2, "KDLH", .destination, minutes: 180)]
        let clock = TimelineClock(leaves: leaves, points: points, zones: ["C81": chicago, "KMSN": chicago, "KDLH": chicago])
        #expect(!clock.zoned)
        #expect(clock.words(leaves, at: points[2]).zone == nil)
    }

    @Test func anotherZoneOnTheWaySaysEveryPointsOwn() throws {
        let points = [point(0, "KOMA", .departure, minutes: 0), point(1, "KDEN", .destination, minutes: 200)]
        let clock = TimelineClock(leaves: leaves, points: points, zones: ["KOMA": chicago, "KDEN": denver])
        #expect(clock.zoned)
        let lands = try #require(clock.at(points[1]))
        #expect(lands == leaves.addingTimeInterval(200 * 60))
        let said = clock.words(lands, at: points[1])
        #expect(said.zone == denver.abbreviation(for: lands))
        #expect(said.time == lands.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: denver)))
        // The departure says its own zone too.
        #expect(clock.zone(points[0]) == chicago)
    }

    @Test func aTimeOfDayEarlierThanNowIsTomorrows() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = chicago
        let now = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 21, hour: 20, minute: 0)))
        let six = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 21, hour: 6, minute: 0)))
        let next = TimelineClock.next(six, after: now, in: chicago)
        #expect(calendar.component(.day, from: next) == 22 && calendar.component(.hour, from: next) == 6)
        let later = try #require(calendar.date(from: DateComponents(year: 2026, month: 11, day: 21, hour: 21, minute: 30)))
        #expect(TimelineClock.next(later, after: now, in: chicago) == later)
    }
}
