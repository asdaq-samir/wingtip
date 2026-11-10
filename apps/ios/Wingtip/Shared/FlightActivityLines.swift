#if canImport(ActivityKit)
import Foundation

/// The Live Activity's words, each figure written by Format as the app
/// writes it everywhere else (formats.json): the widget extension draws
/// these and nothing it writes itself, and FlightActivityTests hold them.
/// Compiled into the app and the extension, with Format.
struct FlightActivityLines: Equatable {
    let state: FlightActivityAttributes.ContentState

    init(_ state: FlightActivityAttributes.ContentState) { self.state = state }

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

    /// The compact island's one figure: the minutes to the next fix, else
    /// to the destination.
    var compact: String {
        if let next = state.nextEteMin { return Format.duration(next) }
        return state.destEteMin.map(Format.duration) ?? Format.none
    }

    /// The same figure for a Dynamic Island drawn narrow (iOS 27: two Live
    /// Activities on an iPhone 18 Pro, landscape, iPhone Duo), where Apple
    /// asks for a short form rather than cut words (WidgetKit,
    /// isDynamicIslandLimitedInWidth): under an hour as before, "12m"; an
    /// hour or more as a nav log writes it, "1:25" rather than "1h 25m".
    var compactNarrow: String {
        guard let minutes = state.nextEteMin ?? state.destEteMin else { return Format.none }
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
        var parts = [nextSentence, "arriving \(eta)"]
        if let fuel { parts.append("\(fuel) planned left") }
        if let frequency = state.frequency { parts.append(frequency) }
        if let copilot = state.copilot { parts.append(copilot) }
        return parts.joined(separator: ", ")
    }
}
#endif
