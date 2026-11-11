import Foundation

/// The debriefs the coach reads, from the pilot's own saved flights, as
/// the web's coachDebriefs gathers them: each flight of the last half
/// year with a track saved to the account, the newest six, debriefed
/// against its plan by the planner (POST /api/debrief, the engine's
/// debrief: its legs and its pattern entries, ACS PA.VI.A and PA.III.B),
/// trimmed to what the engine's proficiency_plan reads, and each approach
/// it flew into its destination debriefed against the procedure by the
/// engine's approach_find (CoachApproaches). Nothing is judged here: the
/// engine finds what is weak in them.
enum CoachDebriefs {
    /// The newest flights looked at: a few weeks' flying, each asking for
    /// its track and its plan.
    static let mostFlights = 6
    /// The engine reads the debriefs of the last half year (its
    /// RECENT_DAYS); older flights are not fetched at all.
    static let recentSeconds: TimeInterval = 183 * 86_400

    /// The flight's debrief as the planner gives it, trimmed; nil where
    /// the track never flew.
    static func trimmed(_ answer: DebriefAnswer, place: String, flownOn: String) -> CoachDebrief? {
        guard let d = answer.debrief else { return nil }
        return CoachDebrief(
            elevationFt: nil, findings: [], flownOn: flownOn, kind: "flight",
            legs: d.legs.map { APICoachLeg(altitudeWithin: $0.altitudeWithin, courseWithin: $0.courseWithin, from: $0.from, ok: $0.ok, to: $0.to) },
            patterns: d.patterns.map { APICoachPattern(ident: $0.ident, offFt: $0.offFt, ok: $0.ok) },
            place: place, profile: [])
    }

    /// The day a track flew, on the pilot's calendar (`t` in ms).
    static func day(ofMs t: Int, zone: TimeZone = .current) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let c = calendar.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: Double(t) / 1000))
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// The flights the coach looks at: the last half year's, newest first.
    static func recent(_ flights: [SavedFlight], now: Date = Date()) -> [SavedFlight] {
        let when = { (f: SavedFlight) in Self.date(f.plannedFor ?? f.createdAt) ?? .distantPast }
        return flights.filter { now.timeIntervalSince(when($0)) <= recentSeconds }
            .sorted { when($0) > when($1) }
            .prefix(mostFlights).map { $0 }
    }

    /// The debriefs of the pilot's newest flights with a track, newest
    /// first, each flight's approaches after it; a flight whose track or
    /// plan cannot be had is left out.
    @Sendable static func fetch() async -> [CoachDebrief] {
        guard let flights = try? await Gateway.flights() else { return [] }
        var out: [CoachDebrief] = []
        for summary in recent(flights) {
            guard let track = try? await Gateway.track(summary.id), let first = track.points.first,
                  let flight = try? await Gateway.flightDetail(summary.id) else { continue }
            let place = "\(flight.departureIdent)-\(flight.destinationIdent)"
            let flownOn = day(ofMs: first.t)
            if let answer = try? await Planner.debrief(checkpoints: flight.checkpoints, points: track.points),
               let d = trimmed(answer, place: place, flownOn: flownOn) { out.append(d) }
            out += await CoachApproaches.fetch(destination: flight.destinationIdent, track: track, flownOn: flownOn)
        }
        return out
    }

    private static func date(_ iso: String) -> Date? {
        let full = ISO8601DateFormatter()
        full.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return full.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }
}
