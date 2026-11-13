import SwiftUI

/// "To 19 Dec 2026" in the go ink, or "Ended …" or "Not current" in the
/// problem ink: a day the gateway worked out, against today, with a
/// symbol beside the colour so it is never the only sign (HIG
/// Accessibility).
struct UntilText: View {
    let date: String?
    /// A currency still to come (instrument currency from approaches flown
    /// this month, 14 CFR 61.57(c)(1)): "From 1 Nov 2026" in orange, as the
    /// pilot is not current yet.
    var from: String? = nil

    var body: some View {
        let current = Day.current(date)
        if current, let from, from > Day.today() {
            Label("From \(Day.said(from))", systemImage: "exclamationmark.triangle.fill")
                .monospacedDigit()
                .foregroundStyle(WingtipInk.caution)
        } else {
            Label(date.map { current ? "To \(Day.said($0))" : "Ended \(Day.said($0))" } ?? "Not current",
                  systemImage: current ? "checkmark.circle.fill" : "xmark.octagon.fill")
                .monospacedDigit()
                .foregroundStyle(current ? WingtipInk.go : WingtipInk.problem)
        }
    }
}
