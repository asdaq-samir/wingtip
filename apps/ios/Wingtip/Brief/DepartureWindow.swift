import Foundation
import Observation

/// "When should I go?", the Brief's hour strip (the web's
/// useDepartureWindow): the planner's answer for the route on the Brief
/// with the airplane, the pilot's minimums and currency (POST
/// /api/departure-window, the engine's departure_window over the Go /
/// No-Go's own findings, each hour a departure of its own), and the hour
/// the pilot tapped. Signed in only: the planner's heaviest ask is kept to
/// pilots with an account. The words are DepartureWindow's static ones.
typealias WindowAnswer = APIDepartureWindow
typealias WindowHour = APIWindowHour

@MainActor
@Observable
final class DepartureWindow {
    private(set) var answer: WindowAnswer?
    private(set) var problem: String?
    private(set) var asking = false
    /// The departure hour tapped, by its time; tapped again, put away.
    private(set) var picked: String?

    /// The hours across the next two days, as far as the forecasts reach.
    static let hours = 48

    var selected: WindowHour? { answer?.hours.first { $0.depart == picked } }

    func pick(_ depart: String) { picked = picked == depart ? nil : depart }

    /// The hour nearest a time said to Siri ("tomorrow at 9"), within half
    /// an hour of it; none picked where the hours do not reach it.
    func pick(nearest when: Date) {
        let iso = ISO8601DateFormatter()
        let near = answer?.hours.compactMap { hour in iso.date(from: hour.depart).map { (hour.depart, abs($0.timeIntervalSince(when))) } }
            .filter { $0.1 <= 30 * 60 }.min { $0.1 < $1.1 }
        if let near { picked = near.0 }
    }

    /// The question: the Go / No-Go's own for the plan, with the
    /// planner's defaults for the rest and each hour a departure.
    static func ask(_ goNoGo: GoNoGoAsk, airplane: Bool) throws -> APIDepartureWindowAsk {
        var ask: APIDepartureWindowAsk = try Engine.recoded(goNoGo)
        ask.hours = hours
        ask.airplane = airplane
        ask.rules = "vfr"
        ask.depart = nil
        return ask
    }

    /// The hours asked for the question worked out; where it couldn't be
    /// written, that is said in the window's place, never no hours.
    func refresh(asking: Result<APIDepartureWindowAsk, any Error>) async {
        switch asking {
        case .success(let ask): await refresh(ask)
        case .failure(let error):
            answer = nil
            problem = "Hours unavailable: the question couldn't be put together (\(error.localizedDescription))."
        }
    }

    func refresh(_ ask: APIDepartureWindowAsk?) async {
        guard let ask else { answer = nil; return }
        asking = true
        defer { asking = false }
        do {
            answer = try await Planner.call { try await $0.departureWindow(body: .json(ask)).ok.body.json }
            problem = nil
        } catch {
            guard !Task.isCancelled else { return }
            problem = "Hours unavailable: \(error.localizedDescription)"
        }
    }

    // MARK: Words

    /// What each verdict is called.
    static func word(_ verdict: String) -> String {
        switch verdict {
        case "go": "Go"
        case "caution": "Caution"
        case "no-go": "No-go"
        default: "Not known"
        }
    }

    /// An instant's clock time where the phone is, "07:00".
    static func clock(_ iso: String, zone: TimeZone = .current) -> String {
        BriefLegs.clock(iso, zone: zone) ?? iso
    }

    /// The weekday an hour falls on where it is not today's, "Tue".
    static func dayOf(_ iso: String, now: Date, zone: TimeZone = .current) -> String? {
        guard let at = AirportWords.date(iso) else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        guard !calendar.isDate(at, inSameDayAs: now) else { return nil }
        let format = DateFormatter()
        format.locale = Format.locale
        format.timeZone = zone
        format.dateFormat = "EEE"
        return format.string(from: at)
    }

    /// The best window in a line: "Best: 07:00–10:00 CST", one hour
    /// alone "Best: 07:00 CST", a day not today named.
    static func bestLine(_ w: APIWindow, now: Date, zone: TimeZone = .current) -> String {
        let day = dayOf(w.start, now: now, zone: zone).map { "\($0) " } ?? ""
        let span = w.hours > 1 ? "\(clock(w.start, zone: zone))–\(clock(w.last, zone: zone))" : clock(w.start, zone: zone)
        let name = AirportWords.date(w.start).flatMap { zone.abbreviation(for: $0) } ?? ""
        return "Best: \(day)\(span) \(name)".trimmingCharacters(in: .whitespaces)
    }

    /// An hour's time and fuel, "ETE 58m · 11.6 gal"; with no airplane,
    /// that they need one (docs/decisions/0011).
    static func figures(_ h: WindowHour, airplane: Bool) -> String {
        guard airplane else { return "ETE and fuel need an airplane" }
        let parts = [h.eteMin.map { "ETE \(Format.duration($0))" }, h.fuelGal.map { Format.fuel($0) }].compactMap { $0 }
        return parts.isEmpty ? "No time or fuel worked out" : parts.joined(separator: " · ")
    }

    /// An hour for VoiceOver: its time, its verdict and why.
    static func label(_ h: WindowHour, zone: TimeZone = .current) -> String {
        let why = h.reasons.first.map { ". \($0.detail)" } ?? ""
        return "\(clock(h.depart, zone: zone)): \(word(h.verdict))\(h.night ? ", at night" : "")\(why)"
    }
}
