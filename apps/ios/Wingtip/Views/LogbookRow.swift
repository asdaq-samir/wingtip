import SwiftUI

/// A flight in the logbook: its day and route, its hours, and under them
/// the airplane, its type, the landings and the remarks. A tap edits it;
/// the airplane's N-number is a tap of its own, opening its profile (the
/// owner, 2026-11-09: "tapping any N-number opens that airplane's profile").
struct LogbookRow: View {
    @Environment(Navigator.self) private var nav
    let entry: LogbookEntry
    let edit: () -> Void

    var body: some View {
        let e = entry
        let landings = e.dayLandings + e.nightLandings
        let rest = [isNNumber(e.aircraft) ? nil : e.aircraft, e.aircraftType, "\(landings) landing\(landings == 1 ? "" : "s")", e.remarks]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        let tail = e.aircraft.flatMap { isNNumber($0) ? $0.uppercased() : nil }
        // The row a stock Button, plain so it reads as the list's row; the
        // N-number's own button inside it takes its own taps (a borderless
        // button in a row keeps them), and VoiceOver, which hears the row
        // as one button, has the profile as an action of its own.
        Button(action: edit) {
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                HStack {
                    Text(Day.said(e.flownOn) + (e.route.map { " · \($0)" } ?? "")).font(WingtipType.title)
                    Spacer()
                    Text(Format.hours(e.totalHours)).font(WingtipType.detail.monospacedDigit())
                }
                HStack(spacing: WingtipSpace.xs) {
                    if let tail {
                        TailButton(tail)
                        Text("·").foregroundStyle(.secondary)
                    }
                    Text(rest).foregroundStyle(.secondary)
                }
                .font(WingtipType.note)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("Edits the flight")
        .accessibilityActions {
            if let tail {
                Button("Open \(tail)'s Profile") { nav.push(.tail(ProfileAsk(tail: tail))) }
            }
        }
    }
}
