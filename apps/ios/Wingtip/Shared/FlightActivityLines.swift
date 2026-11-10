#if canImport(ActivityKit)
import Foundation

/// The Live Activity's words, each figure written by Format as the app
/// writes it everywhere else (formats.json): the widget extension draws
/// these and nothing it writes itself, and FlightActivityTests hold them.
/// Compiled into the app and the extension, with Format.
struct FlightActivityLines: Equatable {
    let state: FlightActivityAttributes.ContentState

    init(_ state: FlightActivityAttributes.ContentState) { self.state = state }

    /// The phase, in the air where a state from before phases has none.
    var phase: FlightActivityAttributes.Phase { state.phase ?? .airborne }

    /// The share of the route flown, 0 to 1 (0 before the first fix).
    var progress: Double { state.progress ?? 0 }

    /// The next fix with the miles and minutes to it, "PIPER · 14 nm · 12m".
    var nextLine: String {
        [state.nextFix ?? "Destination", state.nextNm.map { Format.distance($0, decimals: 0) }, state.nextEteMin.map(Format.duration)]
            .compactMap { $0 }.joined(separator: " · ")
    }

    /// Before departure: "Ready to depart · VFR", the departure's category
    /// as the Brief had it.
    var readyLine: String {
        state.depCategory.map { "Ready to depart · \($0)" } ?? "Ready to depart"
    }

    /// The planner's time en route, "1h 5m"; the dash where it has none.
    var plannedEte: String { state.plannedEteMin.map(Format.duration) ?? Format.none }

    /// Arrived: "Landed 2:07 PM", and the block time, "Block 1h 25m".
    var landed: String { state.landedAt.map { "Landed \(Format.time($0))" } ?? "Landed" }
    var block: String? { state.blockMin.map { "Block \(Format.duration($0))" } }

    /// The next fix, "PIPER", else the destination's last leg's word.
    var next: String { state.nextFix ?? "Destination" }

    /// The minutes to the next fix, "12m"; the dash where no speed is had.
    var nextEte: String { state.nextEteMin.map(Format.duration) ?? Format.none }

    /// "Next PIPER in 12m", as VoiceOver and the Lock Screen's line say it.
    var nextSentence: String {
        guard let fix = state.nextFix else { return "To the destination" }
        return state.nextEteMin.map { "Next \(fix) in \(Format.duration($0))" } ?? "Next \(fix)"
    }

    /// The arrival as a clock time, "2:07 PM"; the dash with no speed.
    var eta: String { state.eta.map(Format.time) ?? Format.none }

    /// The time to the destination and the miles to it, "1h 5m · 102 nm".
    var toGo: String {
        let distance = Format.distance(state.toGoNm, decimals: 0)
        return state.destEteMin.map { "\(Format.duration($0)) · \(distance)" } ?? distance
    }

    /// The fuel the plan expects left, "18.4 gal"; nil with no airplane.
    var fuel: String? { state.fuelLeftGal.map { Format.fuel($0) } }

    /// The compact island's one figure, Flighty's way: the planned time en
    /// route before departure, the minutes to the destination in the air
    /// (else to the next fix), and "Landed" once down.
    var compact: String {
        switch phase {
        case .ready: return plannedEte
        case .arrived: return "Landed"
        case .airborne:
            return (state.destEteMin ?? state.nextEteMin).map(Format.duration) ?? Format.none
        }
    }

    /// The same figure for a Dynamic Island drawn narrow (iOS 27: two Live
    /// Activities on an iPhone 18 Pro, landscape, iPhone Duo), where Apple
    /// asks for a short form rather than cut words (WidgetKit,
    /// isDynamicIslandLimitedInWidth): under an hour as before, "12m"; an
    /// hour or more as a nav log writes it, "1:25" rather than "1h 25m".
    var compactNarrow: String {
        let minutes: Double? = switch phase {
        case .ready: state.plannedEteMin
        case .arrived: nil
        case .airborne: state.destEteMin ?? state.nextEteMin
        }
        guard let minutes else { return phase == .arrived ? "" : Format.none }
        return minutes.rounded() < 60 ? Format.duration(minutes) : Format.navLogTime(minutes)
    }

    /// The glyph for the minimal island and the compact leading side: the
    /// copilot's mark while it has a message (a warning's octagon, as its
    /// banner draws one), else the airplane.
    var glyph: String {
        guard state.copilot != nil else { return "airplane" }
        return state.copilotWarns ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill"
    }

    /// The whole state as one sentence, for VoiceOver on the minimal and
    /// compact presentations, which have no room for words.
    var spoken: String {
        switch phase {
        case .ready: return "\(readyLine), \(plannedEte) en route"
        case .arrived: return [landed, block].compactMap { $0 }.joined(separator: ", ")
        case .airborne: break
        }
        var parts = ["\(Int((progress * 100).rounded())) percent flown", nextSentence, "arriving \(eta)"]
        if let fuel { parts.append("\(fuel) planned left") }
        if let frequency = state.frequency { parts.append(frequency) }
        if let copilot = state.copilot { parts.append(copilot) }
        return parts.joined(separator: ", ")
    }
}
#endif
