import Foundation
import Observation

/// What the airplane card shows past its registry record (the owner's P1,
/// 2026-11-14, the web's useAirplaneCard and lib/airplane/lookup): whether
/// it is in the air now, its whole public record (/api/airplanes/{n}), its
/// Planespotters.net photo and its flights, each asked on its own so the
/// record shows at once and nothing waits on the live sources ("Why does
/// looking up a plane takes a long time?"). Each failure is said in place.
@MainActor
@Observable
final class AirplaneLookup {
    /// Whether it is in the air, as the live find answers.
    enum InAir: Equatable {
        case checking
        case flying(TrafficAircraft)
        case ground
        /// Not known now: adsb.lol could not be asked in time.
        case unknown
        case failed(offline: Bool)
    }

    private(set) var inAir: InAir = .checking
    /// Its whole public record; nil while asked or where it failed.
    private(set) var details: APIAirplaneDetails?
    private(set) var detailsFailed = false
    /// Its photo, only where Planespotters.net answered with one.
    private(set) var photo: APIAirplanePhoto?
    /// Its flights newest first; nil while they are looked for.
    private(set) var flights: [PastFlightSummary]?
    private(set) var flightsProblem: String?

    /// Everything but the record, asked together for the N-number and, for
    /// its flights, the ICAO address the registry gives.
    func load(tail: String, hex: String?) async {
        async let found: Void = find(tail)
        async let record: Void = loadDetails(tail)
        async let picture: Void = loadPhoto(tail)
        async let flown: Void = loadFlights(hex)
        _ = await (found, record, picture, flown)
    }

    private func find(_ tail: String) async {
        inAir = .checking
        do {
            let found = try await Planner.findTraffic(tail)
            if let plane = found.aircraft.first {
                inAir = .flying(plane)
            } else {
                inAir = found.checked == false ? .unknown : .ground
            }
        } catch {
            inAir = .failed(offline: error is URLError)
        }
    }

    private func loadDetails(_ tail: String) async {
        do {
            details = try await Planner.airplane(tail)
            detailsFailed = false
            // Where it is usually based is looked up apart: asked again.
            if details?.basedPending == true {
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled, let again = try? await Planner.airplane(tail) { details = again }
            }
        } catch {
            detailsFailed = true
        }
    }

    private func loadPhoto(_ tail: String) async {
        photo = try? await Planner.airplanePhoto(tail)
    }

    private func loadFlights(_ hex: String?) async {
        guard let hex else {
            flights = []
            return
        }
        do {
            flights = try await Planner.pastFlights(hex.lowercased()).flights
            flightsProblem = nil
        } catch {
            flightsProblem = "Its flights couldn't be fetched. Try again in a moment."
        }
    }

    /// The card's one status line under its actions (the web's statusLine,
    /// StatusLine): in the air from the live find, "In the air" its badge
    /// and its height and speed after it; else where its last flight
    /// ended, "On the ground" its badge where it landed; else none heard in
    /// adsb.lol's archive, about six weeks.
    func status(now: Date = Date()) -> (text: String, problem: Bool, badge: BadgeStatus?, rest: String?) {
        let line = plain(now: now)
        switch inAir {
        case .flying(let plane):
            let how = [plane.altitudeFt.map(Format.trafficAltitude), plane.speedKt.map(Format.speed)].compactMap { $0 }
            return (line.text, false, .inAir, how.joined(separator: " · "))
        default:
            let ground = "On the ground · "
            return line.text.hasPrefix(ground) ? (line.text, false, .ground, String(line.text.dropFirst(ground.count))) : (line.text, line.problem, nil, nil)
        }
    }

    private func plain(now: Date) -> (text: String, problem: Bool) {
        switch inAir {
        case .flying(let plane):
            let how = [plane.altitudeFt.map(Format.trafficAltitude), plane.speedKt.map(Format.speed)].compactMap { $0 }
            return ((["In the air"] + how).joined(separator: " · "), false)
        case .checking where flights == nil:
            return ("Checking whether it's in the air…", false)
        case .unknown where flights == nil:
            return ("Whether it's in the air isn't known now. Try again in a moment.", true)
        case .failed(let offline) where flights == nil:
            return (offline ? "No connection: whether it's in the air can't be checked." : "Couldn't check whether it's in the air. Try again in a moment.", true)
        default:
            break
        }
        if let latest = flights?.first(where: { !$0.inAir }) {
            let since = Self.ago(now.timeIntervalSince1970 - latest.on)
            if latest.landed, let at = latest.destination?.ident { return ("On the ground · landed \(at) \(since)", false) }
            return ("Not in the air · last heard \(since)", false)
        }
        if flights?.isEmpty == true, case .ground = inAir { return ("Not heard in the last 6 weeks", false) }
        switch inAir {
        case .checking: return ("Checking whether it's in the air…", false)
        case .ground: return ("Not in the air now", false)
        case .unknown: return ("Whether it's in the air isn't known now. Try again in a moment.", true)
        case .failed(let offline): return (offline ? "No connection: whether it's in the air can't be checked." : "Couldn't check whether it's in the air. Try again in a moment.", true)
        case .flying: return ("In the air", false)
        }
    }

    /// The airplane in the air now, for Track.
    var flying: TrafficAircraft? {
        if case .flying(let plane) = inAir { return plane }
        return nil
    }

    /// "3 h ago", "2 d ago", as the web's ago writes it.
    static func ago(_ seconds: Double) -> String {
        let minutes = max(0, Int((seconds / 60).rounded()))
        if minutes < 1 { return "just now" }
        if minutes < 90 { return "\(minutes) min ago" }
        let hours = Int((Double(minutes) / 60).rounded())
        return hours < 36 ? "\(hours) h ago" : "\(Int((Double(hours) / 24).rounded())) d ago"
    }
}

extension Planner {
    /// An airplane's whole public record by its N-number (/api/airplanes/{n}).
    static func airplane(_ tail: String) async throws -> APIAirplaneDetails {
        try await call { try await $0.airplane(path: .init(nNumber: tail)).ok.body.json }
    }

    /// Its newest Planespotters.net photo; nil where there is none, which
    /// the planner answers with a bare null.
    static func airplanePhoto(_ tail: String) async throws -> APIAirplanePhoto? {
        do {
            return try await call { try await $0.airplanePhoto(path: .init(nNumber: tail)).ok.body.json }
        } catch is DecodingError {
            return nil
        }
    }
}
