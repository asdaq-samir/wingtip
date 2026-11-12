import SwiftUI

/// An airplane's profile asked for: its N-number, and the figure to start
/// at, where an inline ask's Edit opened it.
struct ProfileAsk: Identifiable, Hashable {
    let tail: String
    var focus: OwnFigure?
    var id: String { "\(tail)|\(focus?.rawValue ?? "")" }
}

/// An N-number, tapped to open its airplane's profile, wherever one is
/// shown (the owner, 2026-11-09: "tapping any N-number opens that
/// airplane's profile"): in the tint's blue, a 44-point area round it.
/// The one profile card (AirplaneProfileView): pushed in the card it is
/// in, with Back, or its own card from the plan (Navigator.push).
struct TailButton<Label: View>: View {
    @Environment(Navigator.self) private var nav
    let tail: String
    @ViewBuilder var label: () -> Label

    var body: some View {
        Button { nav.push(.tail(ProfileAsk(tail: tail.uppercased()))) } label: { label() }
            .buttonStyle(.borderless)
            .contentShape(Rectangle().inset(by: -WingtipSpace.md))
            .accessibilityHint("Opens \(tail.uppercased())'s profile")
    }
}

extension TailButton where Label == Text {
    /// The N-number itself as the button.
    init(_ tail: String) {
        self.tail = tail
        self.label = { Text(tail.uppercased()).monospaced() }
    }
}

/// A figure of the airplane flown, tapped to open its profile, where it
/// is set (the owner, 2026-11-09: "every airplane figure shown is tappable
/// to that profile"); as it is where the airplane has no N-number.
struct AirplaneFiguresLink<Label: View>: View {
    @Environment(Plan.self) private var plan
    @ViewBuilder var label: () -> Label

    var body: some View {
        if let tail = plan.tail { TailButton(tail: tail, label: label) } else { label() }
    }
}

/// An airplane's registration as a row's value: an N-number opens its
/// profile; any other (a foreign registration) is said as it is.
struct RegistrationText: View {
    let registration: String?
    init(_ registration: String?) { self.registration = registration }

    var body: some View {
        if let registration, isNNumber(registration) { TailButton(registration) } else { Text(registration ?? "—") }
    }
}

/// Whether a text is an N-number (the engine's n_number, 14 CFR 47.15(b)),
/// so only a registration opens a profile; false where the engine cannot say.
func isNNumber(_ text: String?) -> Bool {
    guard let text, !text.isEmpty else { return false }
    return (try? Registered.isNNumber(text.uppercased())) == true
}

#Preview("TailButton") {
    List {
        TailButton("N123AB")
        TailButton(tail: "N3429J") { Text("N3429J · PA-28-140") }
    }
    .environment(Plan())
    .environment(Session())
}
