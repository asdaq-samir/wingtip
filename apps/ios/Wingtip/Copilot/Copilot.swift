import CoreLocation
import Foundation
import Observation
import PlannerAPI

/// The in-flight copilot (the web's features/copilot): while flying with
/// a route, the one message that matters most now from the engine's
/// copilot_watch, over what the planner reads round the airplane
/// (/api/copilot/around: the fields with their METARs, the areas on the
/// rest of the route, ITWS's alerts at the destination), the alerts
/// ahead, the pilot's minimums and the fuel; said aloud once where the
/// pilot asked for it. Nothing is refused or held back: the engine warns,
/// the pilot decides (docs/decisions/0008).
@MainActor
@Observable
final class Copilot {
    static let shared = Copilot()

    /// Off, shown, or shown and said: Setup's Alerts (the web's copilotMode).
    enum Mode: String, CaseIterable, Identifiable, Sendable {
        case off, on, spoken
        var id: String { rawValue }
        var label: String {
            switch self {
            case .off: "Off"
            case .on: "On"
            case .spoken: "Spoken"
            }
        }
    }

    typealias Message = EngineContract.CopilotMessage
    typealias Input = EngineContract.CopilotWatchInput

    static let modeKey = "copilotMode"
    var mode: Mode = Mode(rawValue: UserDefaults.standard.string(forKey: modeKey) ?? "") ?? .on {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: Self.modeKey) }
    }

    private(set) var message: Message?
    private(set) var around: APICopilotAround?
    @ObservationIgnored private var askedKey: String?
    @ObservationIgnored private var askedAt = Date.distantPast
    @ObservationIgnored private var firstSeen: [String: String?] = [:]
    @ObservationIgnored private var startedAt: Date?
    @ObservationIgnored private var said: Set<String> = []
    @ObservationIgnored private var dismissed: Set<String> = []
    @ObservationIgnored let voice = CopilotVoice()

    /// How often the planner is asked again for the reports round the
    /// airplane, s: METARs come hourly and a SPECI at any time; TFRs, SFDPS
    /// and ITWS are read live.
    static let askEveryS: TimeInterval = 60

    /// The flight as planned, as the copilot reads it.
    struct Flight: Equatable {
        var dest: String
        var line: [[Double]]
        var plannedGsKt: Double?
        var tasKt: Double?
        var burnGph: Double?
        var fuelGal: Double?
    }

    /// The flight from the plan: nil with no route or no line. With no
    /// airplane's figures the fuel and speeds are nil, never assumed.
    static func flight(_ plan: Plan) -> Flight? {
        guard let course = plan.course, course.coordinates.count >= 2, !plan.dest.isEmpty else { return nil }
        let line = course.coordinates.map { [$0.latitude, $0.longitude] }
        // No airplane picked: the weather and the areas ahead, and no
        // fuel or groundspeed message, which would be an assumed airplane's.
        guard plan.airplaneChosen else { return Flight(dest: plan.dest.uppercased(), line: line) }
        let totals = plan.totals
        let gs = totals.flatMap { t in t.eteMin.flatMap { $0 > 0 ? t.distanceNm / ($0 / 60) : nil } }
        return Flight(dest: plan.dest.uppercased(), line: line,
                      plannedGsKt: gs, tasKt: plan.legs.first?.tasKt, burnGph: plan.legs.first?.fuelBurnGph,
                      fuelGal: totals?.usableFuelGal)
    }

    /// The rest of the route from the airplane, as /api/copilot/around
    /// takes it ("lat,lon;..."): from where it is, through the points after
    /// the leg it is on, rounded to a few hundred metres so the question is
    /// asked again only as the airplane goes somewhere new.
    static func restOfRoute(_ at: CLLocationCoordinate2D, line: [[Double]], leg: Int) -> String {
        let round = { (n: Double) in Format.number((n * 200).rounded() / 200, decimals: 3) }
        let rest = [[at.latitude, at.longitude]] + line.dropFirst(min(line.count, leg + 1))
        return rest.map { "\(round($0[0])),\(round($0[1]))" }.joined(separator: ";")
    }

    /// One look: the reports asked where the airplane has gone somewhere
    /// new or a minute has passed, then the engine's message now.
    func look(fix: OwnShip.Fix?, flying: Bool, plan: Plan, ahead: [AheadAlert], minimums: PersonalMinimums, now: Date = Date()) async {
        guard mode != .off, flying, let fix, let flight = Self.flight(plan) else {
            reset()
            return
        }
        if startedAt == nil { startedAt = fix.at }
        let position = try? Engine.routePosition(at: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude), line: flight.line)
        let path = Self.restOfRoute(fix.coordinate, line: flight.line, leg: Int(position?.leg ?? 0))
        let at = { (n: Double) in Format.number((n * 10).rounded() / 10, decimals: 1) }
        let query: [String: String?] = ["lat": at(fix.coordinate.latitude), "lon": at(fix.coordinate.longitude), "dest": flight.dest, "path": path]
        let key = query.map { "\($0.key)=\($0.value ?? "")" }.sorted().joined(separator: "&")
        if key != askedKey || now.timeIntervalSince(askedAt) >= Self.askEveryS {
            askedKey = key
            askedAt = now
            let tenth = { (n: Double) in (n * 10).rounded() / 10 }
            let asked = Operations.CopilotAround.Input.Query(lat: tenth(fix.coordinate.latitude), lon: tenth(fix.coordinate.longitude), dest: flight.dest, path: path)
            if let fresh = try? await Planner.call(.inFlight, { try await $0.copilotAround(query: asked).ok.body.json }) {
                around = fresh
                for field in fresh.fields where firstSeen[field.ident] == nil { firstSeen[field.ident] = .some(field.metar?.flightCategory) }
            }
        }
        guard let around, let input = try? Self.input(fix: fix, flight: flight, around: around, ahead: ahead, minimums: minimums,
                                                      remainingNm: position?.leftNm, startedAt: startedAt, firstSeen: firstSeen) else { return }
        guard let answer = try? Self.watch(input) else { return }
        let first = answer.messages.first { !dismissed.contains($0.id) }
        if first?.id != message?.id || first?.title != message?.title { message = first }
        // Said once a message, and only the copilot's own: the alerts
        // banner speaks what is ahead.
        if let first, !first.elsewhere, !said.contains(first.id) {
            said.insert(first.id)
            // Spoken, the copilot's own voice says it; else VoiceOver does,
            // for a pilot who cannot see the banner come in.
            if mode == .spoken { voice.say(first.say, interrupt: first.level == "warning") } else { Announce.alert(first.title, urgent: first.level == "warning") }
        }
    }

    /// The engine's question from what the app has: own ship, the flight
    /// as planned, the planner's answer round the airplane (its members
    /// the engine's, in its snake case), the alerts ahead, the pilot's
    /// minimums, the fuel left by the plan's burn since the flight began,
    /// and the category each field was first seen in.
    static func input(fix: OwnShip.Fix, flight: Flight, around: APICopilotAround, ahead: [AheadAlert], minimums: PersonalMinimums,
                      remainingNm: Double?, startedAt: Date?, firstSeen: [String: String?]) throws -> Input {
        let snake = Planner.snakeEncoder
        let hours = startedAt.map { max(0, fix.at.timeIntervalSince($0)) / 3600 } ?? 0
        let fuel = flight.fuelGal.flatMap { gal in flight.burnGph.map { max(0, gal - $0 * hours) } }
        let fields: [EngineContract.CopilotField] = try around.fields.map { field in
            var read: EngineContract.CopilotField = try Engine.recoded(field, encoder: snake)
            read.plannedCategory = firstSeen[field.ident] ?? nil
            return read
        }
        return Input(
            nowS: fix.at.timeIntervalSince1970,
            own: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, trackDeg: fix.trackDeg, gsKt: fix.groundspeedKt),
            fields: fields, rules: "VFR",
            minimums: .init(ceilingFt: minimums.ceilingFt, visibilitySm: minimums.visibilitySm, crosswindKt: minimums.crosswindKt, windKt: minimums.windKt),
            fuelGal: fuel, burnGph: flight.burnGph, tasKt: flight.tasKt, dest: flight.dest, alternate: nil, remainingNm: remainingNm,
            plannedGsKt: flight.plannedGsKt, passengers: nil, nightCurrent: nil,
            areas: try around.areas.map { try Engine.recoded($0, encoder: snake) },
            itws: try around.itws.map { try Engine.recoded($0, encoder: snake) },
            ahead: ahead.map { .init(id: $0.id, kind: $0.kind, level: $0.level, name: $0.name) })
    }

    /// The engine's answer to the typed question: each field's METAR
    /// carries its report as sent (`raw`), which the copilot's IFR and
    /// ceiling checks read.
    static func watch(_ input: Input) throws -> EngineContract.CopilotWatchAnswer {
        try Engine.rule("copilot_watch", input)
    }

    /// The message put away; the next comes in its place.
    func dismiss() {
        guard let message else { return }
        dismissed.insert(message.id)
        self.message = nil
    }

    /// The next flight starts afresh: its first categories, its fuel.
    private func reset() {
        message = nil
        around = nil
        askedKey = nil
        firstSeen = [:]
        startedAt = nil
        said = []
        dismissed = []
    }
}
