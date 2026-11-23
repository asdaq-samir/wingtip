import Foundation

/// The clocks FPL's timeline says its times in (the web's clockIn and
/// clockElsewhere, 5d511a375 and f49fb4da2): this iPhone's bare clock while
/// the whole route keeps the departure's time, and once any point keeps
/// another -- its field's own zone at its arrival, from its card's
/// time_zone -- every point's own clock with its zone after it, the
/// departure's too ("13:00 MST", "18:43 CST"; the owner, 2026-11-20: "When
/// the time zone changes then show it on all the stops").
struct TimelineClock: Equatable, Sendable {
    /// When the flight leaves: the time picked, else now.
    let leaves: Date
    /// The departure's zone, its field's; nil at a position or with no
    /// card yet, where this iPhone's stands in.
    let departZone: TimeZone?
    /// Each field's zone by its ident, from its card.
    let zones: [String: TimeZone]
    /// Whether any point keeps another clock than the departure's.
    let zoned: Bool

    init(leaves: Date, points: [TimelinePoint], zones: [String: TimeZone]) {
        self.leaves = leaves
        self.zones = zones
        let depart = points.first.flatMap { zones[$0.ident.uppercased()] }
        departZone = depart
        let home = depart ?? .current
        zoned = points.contains { point in
            guard point.role != .departure, let minutes = point.minutes, let zone = zones[point.ident.uppercased()] else { return false }
            let at = leaves.addingTimeInterval(minutes * 60)
            return zone.secondsFromGMT(for: at) != home.secondsFromGMT(for: at)
        }
    }

    /// The zone a point's time is said in: its field's, else the
    /// departure's, else this iPhone's.
    func zone(_ point: TimelinePoint) -> TimeZone {
        zones[point.ident.uppercased()] ?? departZone ?? .current
    }

    /// When the airplane is at a point, to the minute; nil with no time.
    func at(_ point: TimelinePoint) -> Date? {
        guard let minutes = point.minutes else { return nil }
        let at = leaves.addingTimeInterval(minutes * 60)
        return Date(timeIntervalSince1970: (at.timeIntervalSince1970 / 60).rounded(.down) * 60)
    }

    /// A time as a point's line says it: the bare clock, or once zoned the
    /// point's own clock and its zone's short name.
    /// Its day too where it is not the day the flight left, "Tue 15:54"
    /// (Format.arrivalDay), its day counted in the zone its clock is read
    /// in: this iPhone's for the bare clock, so the two never disagree.
    func words(_ date: Date, at point: TimelinePoint) -> (time: String, zone: String?) {
        let there = zoned ? zone(point) : TimeZone.current
        let day = Format.arrivalDay(date, left: leaves, zone: there, leftZone: zoned ? departZone : .current).map { "\($0) " } ?? ""
        guard zoned else { return (day + Format.time(date), nil) }
        return (day + date.formatted(Date.FormatStyle(date: .omitted, time: .shortened, timeZone: there)), Format.zoneName(there, at: date))
    }

    /// A time of day picked for the departure, as the next time the clock
    /// in `zone` reads it from now on: 06:00 picked at 20:00 is tomorrow's,
    /// a minute ago still today's.
    static func next(_ picked: Date, after now: Date = Date(), in zone: TimeZone) -> Date {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let time = calendar.dateComponents([.hour, .minute], from: picked)
        return calendar.nextDate(after: now.addingTimeInterval(-60), matching: time, matchingPolicy: .nextTime) ?? picked
    }
}
