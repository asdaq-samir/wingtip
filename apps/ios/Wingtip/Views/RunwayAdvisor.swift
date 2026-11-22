import Foundation
import Observation

/// The runway proximity advisor on the own-ship diagram: "Approaching
/// runway 9-27", "On runway 27", the hold short line's distance and the
/// hot spot near, as the engine's runway_proximity words them (AC 120-74B
/// 7e(2)(d)'s "approaching (specific runway number) hold short line"; the
/// rule, its figures and its sources are the engine's,
/// engine/crates/brief/src/runway/proximity). Asked once a second with the
/// fix, the field's runways from its card (NASR's thresholds and widths,
/// closed ones too) and the diagram's hot spots; said aloud only when what
/// it says changes (the answer's key), never again for a distance. A
/// reminder for the pilot's eyes outside, never a clearance: the signs,
/// the markings and ATC rule (AC 120-76D 11.17.1).
@MainActor
@Observable
final class RunwayAdvisor {
    typealias Answer = EngineContract.RunwayProximityAnswer

    /// The engine's answer now; nil before the first fix is asked.
    private(set) var answer: Answer?
    /// The engine refused the ask: the line under the page says so.
    private(set) var problem: String?
    /// Said aloud (the diagram's speaker button), on by default: the
    /// pilot's eyes are outside while taxiing (AC 120-74B 7g). Off, a
    /// pilot with VoiceOver still hears it announced.
    var speaks: Bool = UserDefaults.standard.object(forKey: RunwayAdvisor.speaksKey) as? Bool ?? true {
        didSet { UserDefaults.standard.set(speaks, forKey: Self.speaksKey) }
    }

    static let speaksKey = "speakRunways"
    @ObservationIgnored private var saidKey: String?
    @ObservationIgnored private let voice = SpokenAlerts()
    @ObservationIgnored let field: Field

    /// What the engine is asked of the field, from its card.
    struct Field: Sendable {
        let elevationFt: Double?
        let patternAglFt: Double?
        let runways: [EngineContract.RunwayProximityInputRunwaysItem]

        init(_ place: AirportPlace) {
            elevationFt = place.elevationFt
            // The field's own published pattern height, else none: the
            // engine takes AC 90-66C's 1,000 ft.
            patternAglFt = place.pattern?.published == true ? place.pattern?.aglFt : nil
            runways = place.runways.map { runway in
                .init(widthFt: runway.widthFt.map(Double.init), closed: runway.closed,
                      runwayEnds: (runway.runwayEnds ?? []).map { .init(ident: $0.ident, lat: $0.lat, lon: $0.lon) })
            }
        }
    }

    init(place: AirportPlace) {
        field = Field(place)
    }

    /// The engine asked with the fix at `now`, and the words said where
    /// they changed.
    func hear(_ fix: OwnShip.Fix?, hotSpots: [DiagramPage.HotSpot], now: Date = Date()) {
        guard let fix else {
            answer = nil
            saidKey = nil
            return
        }
        do {
            let next = try Self.ask(fix, field: field, hotSpots: hotSpots, now: now)
            answer = next
            problem = nil
            say(next)
        } catch {
            answer = nil
            problem = "The runway advisor couldn't check your position."
        }
    }

    /// The engine's answer for a fix: its age at `now`, its accuracy (AC
    /// 120-76D 11.17.2.3, 11.17.2.4, held by the engine), its track,
    /// speed and GNSS height.
    nonisolated static func ask(_ fix: OwnShip.Fix, field: Field, hotSpots: [DiagramPage.HotSpot], now: Date) throws -> Answer {
        try Engine.runwayProximity(
            fix: .init(lat: fix.coordinate.latitude, lon: fix.coordinate.longitude, ageS: now.timeIntervalSince(fix.at),
                       accuracyM: fix.accuracyM, trackDeg: fix.trackDeg, groundspeedKt: fix.groundspeedKt, altitudeFt: fix.altitudeFt),
            elevationFt: field.elevationFt, patternAglFt: field.patternAglFt, runways: field.runways,
            hotSpots: hotSpots.map { .init(name: $0.name, lat: $0.lat, lon: $0.lon) })
    }

    /// Said once as it changes: a new state, runway, end or hot spot.
    private func say(_ next: Answer) {
        guard next.key != saidKey else { return }
        saidKey = next.key
        guard let words = next.spoken else { return }
        if speaks { voice.say(words, force: true) } else { Announce.alert(words) }
    }

    /// The lines over the page: what is said, and its distance under it.
    var lines: (shown: String, detail: String?)? {
        guard let answer, let shown = answer.shown ?? answer.detail else { return nil }
        return (shown, answer.shown == nil ? nil : answer.detail)
    }

    /// Over a runway or at its hold short line: drawn in the warning's colour.
    var urgent: Bool {
        guard let answer else { return false }
        return answer.state == "on_runway" || (answer.state == "approaching" && (answer.holdShortFt ?? 1) == 0) || answer.closed
    }
}

extension RunwayAdvisor {
    /// Repeats the ask each second while the diagram is up (its task), so
    /// a fix that stops coming ends the advisor's words with the airplane.
    func watch(_ fix: @escaping @MainActor () -> OwnShip.Fix?, hotSpots: @escaping @MainActor () -> [DiagramPage.HotSpot]) async {
        while !Task.isCancelled {
            hear(fix(), hotSpots: hotSpots())
            try? await Task.sleep(for: .seconds(1))
        }
    }
}
