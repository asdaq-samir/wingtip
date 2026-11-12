import Observation
import SwiftUI

/// Which answers on the screens are the kept ones, and from when: noted
/// as each model falls back on what KeptForAir (or Kept, for the briefing
/// and the plan) holds, and cleared as the planner answers again, so a
/// screen says its age only while it is showing an old answer.
@MainActor
@Observable
final class KeptShown {
    static let shared = KeptShown()

    private(set) var at: [String: Date] = [:]

    private static func name(_ kind: KeptForAir.Kind, _ key: String) -> String { "\(kind.rawValue)|\(key)" }

    /// The kept answer of `kind` for `key` shown, fetched at `at`; nil once
    /// a fresh one is.
    func note(_ kind: KeptForAir.Kind, key: String, at date: Date?) {
        let name = Self.name(kind, key)
        if at[name] != date { at[name] = date }
    }

    func at(_ kind: KeptForAir.Kind, key: String) -> Date? { at[Self.name(kind, key)] }
}

/// "Fetched 42 min ago" under an answer shown from what the phone kept,
/// in the caution's ink once past the freshness ready to fly holds that
/// kind to (the engine's `kept_age`; no limit is written here). A line
/// to read, never a stop: the answer stays on the screen (warn, never
/// limit). Nothing while the answer is fresh from the planner.
struct KeptAgeLine: View {
    @Environment(KeptShown.self) private var keptShown
    let kind: KeptForAir.Kind
    let key: String

    var body: some View {
        if let at = keptShown.at(kind, key: key) {
            TimelineView(.everyMinute) { context in
                if let age = try? Engine.keptAge(now: context.date.timeIntervalSince1970, fetchedAt: at.timeIntervalSince1970, kind: kind.rawValue) {
                    KeptAgeWords(age: age)
                }
            }
        }
    }
}

/// The engine's line for a kept answer, drawn.
struct KeptAgeWords: View {
    let age: EngineContract.KeptAgeAnswer

    var body: some View {
        let caution = age.finding == "caution"
        Label {
            Text(verbatim: age.line)
        } icon: {
            Image(systemName: caution ? "exclamationmark.triangle.fill" : "clock.arrow.circlepath")
        }
        .font(WingtipType.note.weight(caution ? .semibold : .regular))
        .foregroundStyle(caution ? WingtipInk.caution : Color.secondary)
        .accessibilityElement(children: .combine)
        .accessibilityHint(Text(verbatim: age.detail))
        .accessibilityIdentifier("kept-age")
    }
}

/// Keep for the Air's button's words: the tiles counted as they come, then
/// the briefing and the rest, then what it all came to on the phone.
struct KeepForAirLabel: View {
    let model: KeepForAir

    var body: some View {
        if let keeping = model.keeping {
            if let mb = model.sizeMb {
                Label("Kept for the Air: \(Self.megabytes(mb))", systemImage: "checkmark.icloud")
            } else if model.keepingAnswers {
                Label("Keeping the briefing, NOTAMs and plates…", systemImage: "icloud.and.arrow.down")
            } else {
                Label("Keeping for the Air: \(keeping.kept) of \(keeping.wanted)", systemImage: "icloud.and.arrow.down")
            }
        } else {
            Label("Keep for the Air", systemImage: "icloud.and.arrow.down")
        }
    }

    /// "3 MB", "0.4 MB": the size as a pilot weighs a download.
    static func megabytes(_ mb: Double) -> String {
        mb < 1 ? String(format: "%.1f MB", mb) : "\(Int(mb.rounded())) MB"
    }
}
