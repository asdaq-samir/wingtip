import Foundation
import Observation

/// The dry run played against the forecast (the owner, 2026-11-09), the
/// view model of the dry run's forecast strip and of the areas the map
/// draws while it plays, as the web's useForecastRun is: with forecast
/// mode on, the run is sent to the planner once (POST /api/forecast/run,
/// the engine's `forecast_run`), its clock from the run's start (the
/// iPhone's plan keeps no departure time, so the moment the run began),
/// and as it plays, what the airplane meets where it is now, the newest
/// alert it has reached and the advisory areas in force then. The rule is
/// the engine's; this only asks and picks by time.
@MainActor
@Observable
final class ForecastRun {
    static let shared = ForecastRun()

    /// Forecast mode, off until the pilot turns it on; off forgets the
    /// answer, so on again asks afresh.
    var on = false {
        didSet {
            guard !on else { return }
            answer = nil
            problem = nil
            loading = false
            askedFor = nil
        }
    }
    private(set) var answer: APIForecastRun?
    private(set) var loading = false
    /// Why the forecast could not be had, shown in the strip's place.
    private(set) var problem: String?

    /// The run asked for, by its start: a new run (another route, started
    /// again) is asked again.
    @ObservationIgnored private var askedFor: Date?
    /// The dry run played, whose clock the picks follow.
    @ObservationIgnored private weak var dryRun: DryRun?

    /// The run's time now, s since 1970: its start and the time flown.
    var now: Double? {
        guard let dryRun, let start = dryRun.startedAt else { return nil }
        return start.timeIntervalSince1970 + dryRun.flownS
    }

    /// What the airplane meets now.
    var here: APIRunSample? {
        guard on, let answer, let now else { return nil }
        return ForecastPlay.sample(answer, at: now)
    }

    /// The newest alert the run has reached.
    var alert: APIRunAlert? {
        guard on, let answer, let now else { return nil }
        return ForecastPlay.alert(answer, at: now)
    }

    /// The advisory areas in force now, for the map.
    var areas: [APIRunArea] {
        guard on, let answer, let now else { return [] }
        return ForecastPlay.areas(answer, at: now)
    }

    /// The run sent, once a run, while forecast mode is on.
    func play(_ run: DryRun, minimums: PersonalMinimums, rules: FlightRules = .saved()) async {
        dryRun = run
        guard on, let start = run.startedAt, let course = run.course, run.points.count >= 2, askedFor != start else { return }
        askedFor = start
        answer = nil
        problem = nil
        loading = true
        let ask = ForecastPlay.ask(points: run.points, rowT: run.rowT, landings: run.landings, course: course,
                                   start: start.timeIntervalSince1970, rules: rules, minimums: minimums)
        do {
            let got = try await Planner.call { try await $0.forecastDryRun(body: .json(ask)).ok.body.json }
            guard on, askedFor == start else { return }
            answer = got
        } catch {
            guard on, askedFor == start else { return }
            if Task.isCancelled {
                // Left before the answer came (the strip went away): asked
                // again when it is back.
                askedFor = nil
            } else {
                problem = "The forecast for the run couldn't be fetched: \(error.localizedDescription)"
            }
        }
        loading = false
    }
}

/// The forecast run's pure parts, as the web's forecastRun.ts: the ask
/// made from the dry run, and the answer's picks by the run's time.
enum ForecastPlay {
    /// The most points of a run sent: the planner takes up to 600.
    static let mostPoints = 400

    /// The nav log row the airplane is flying to at `t` (s from the run's
    /// start), the web's dryRunRow: the first row reached at or after `t`,
    /// the last once past them all.
    static func row(_ rowT: [Double], at t: Double) -> Int {
        guard !rowT.isEmpty else { return 0 }
        return rowT.firstIndex { $0 >= t } ?? rowT.count - 1
    }

    /// Every n-th of `items`, so no more than `most` are kept, the last
    /// always among them.
    static func thinned<T>(_ items: [T], most: Int = mostPoints) -> [T] {
        let every = max(1, Int((Double(items.count) / Double(most)).rounded(.up)))
        return items.indices.filter { $0 % every == 0 || $0 == items.count - 1 }.map { items[$0] }
    }

    /// The dry run as the planner's forecast run takes it: its points
    /// thinned, each at its time since 1970 with the row it flies to; the
    /// departure at the start and each landing at its time (the last the
    /// destination), placed from the course; the rules and the pilot's
    /// ceiling and visibility minimums, none where unset.
    static func ask(points: [Replay.Point], rowT: [Double], landings: [EngineContract.DryRunAnswerLandingsItem], course: Course,
                    start: Double, rules: FlightRules, minimums: PersonalMinimums) -> APIForecastRunAsk {
        let track = thinned(points).map { APIRunPoint(altFt: $0.altFt, lat: $0.lat, lon: $0.lon, row: row(rowT, at: $0.t), t: start + $0.t) }
        let ends = [course.departure] + (course.stops ?? []) + [course.destination]
        let at = Dictionary(ends.map { ($0.ident, $0) }, uniquingKeysWith: { first, _ in first })
        let landed: [APIRunField] = landings.enumerated().compactMap { i, landing in
            guard let field = at[landing.ident] else { return nil }
            let role = i == landings.count - 1 ? "destination" : "stop"
            return APIRunField(ident: landing.ident, lat: field.lat, lon: field.lon, role: role, t: start + landing.t)
        }
        let dep = course.departure
        let departure = APIRunField(ident: dep.ident, lat: dep.lat, lon: dep.lon, role: "departure", t: start + (points.first?.t ?? 0))
        return APIForecastRunAsk(fields: [departure] + landed,
                                 minimums: APIRunMinimums(ceilingFt: minimums.ceilingFt, visibilitySm: minimums.visibilitySm),
                                 rules: rules == .ifr ? "IFR" : "VFR", track: track)
    }

    /// The sample the airplane last passed at `t`; the first before it.
    static func sample(_ answer: APIForecastRun, at t: Double) -> APIRunSample? {
        answer.samples.last { $0.t <= t } ?? answer.samples.first
    }

    /// The newest alert reached by `t`.
    static func alert(_ answer: APIForecastRun, at t: Double) -> APIRunAlert? {
        answer.alerts.last { $0.t <= t }
    }

    /// The advisory areas in force at `t`: from their start, up to (not
    /// at) their end, an open end in force.
    static func areas(_ answer: APIForecastRun, at t: Double) -> [APIRunArea] {
        answer.areas.filter { ($0.validFrom.map { $0 <= t } ?? true) && ($0.validTo.map { t < $0 } ?? true) }
    }

    /// An hour as forecasts write it, UTC: "14Z".
    static func hourZ(_ t: Double) -> String {
        String(Format.zulu(Date(timeIntervalSince1970: t)).prefix(2)) + "Z"
    }

    /// The products the planner could not have, in a pilot's words.
    static func unavailable(_ names: [String]) -> String? {
        guard !names.isEmpty else { return nil }
        let words = ["tafs": "TAFs", "airsigmets": "SIGMETs", "gairmets": "G-AIRMETs", "spc-outlook": "the SPC outlook",
                     "glmp-forecast": "the modelled hours (Gridded LAMP)", "winds": "the winds aloft"]
        return "Played without \(names.map { words[$0] ?? $0 }.joined(separator: ", "))."
    }

    /// What the airplane meets, in a line: the category, the ceiling
    /// (above the ground, AIM 7-1-7's), the visibility and the wind aloft.
    /// A wind not known is said so, never calm.
    static func line(_ s: APIRunSample) -> String {
        let ceiling = s.ceilingUnknown ? "ceiling not known" : s.ceilingFt.map { "ceiling \(Format.grouped($0)) ft AGL" } ?? "no ceiling"
        let visibility = s.visibilitySm.map { "visibility \(AirportWords.plain($0)) sm" } ?? "visibility not known"
        let wind = s.windSpeedKt == nil ? "wind aloft not known"
            : "wind aloft \(AirportWords.windLine(dirTrueDeg: s.windDirTrueDeg, speedKt: s.windSpeedKt, gustKt: nil))"
        return [s.category ?? "No category", ceiling, visibility, wind].joined(separator: " · ")
    }
}
