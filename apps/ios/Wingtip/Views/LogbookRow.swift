import SwiftUI

/// A flight in the logbook: its day and route, its hours, and under them
/// the airplane, its type, the landings and the remarks. A tap edits it;
/// the airplane's N-number is a tap of its own, opening its profile (the
/// owner, 2026-11-09: "tapping any N-number opens that airplane's profile").
struct LogbookRow: View {
    let entry: LogbookEntry
    let edit: () -> Void

    var body: some View {
        let e = entry
        let landings = e.dayLandings + e.nightLandings
        let rest = [isNNumber(e.aircraft) ? nil : e.aircraft, e.aircraftType, "\(landings) landing\(landings == 1 ? "" : "s")", e.remarks]
            .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(Day.said(e.flownOn) + (e.route.map { " · \($0)" } ?? "")).font(.headline)
                Spacer()
                Text(Format.hours(e.totalHours)).font(.subheadline.monospacedDigit())
            }
            HStack(spacing: WingtipSpace.xs) {
                if let tail = e.aircraft, isNNumber(tail) {
                    TailButton(tail)
                    Text("·").foregroundStyle(.secondary)
                }
                Text(rest).foregroundStyle(.secondary)
            }
            .font(.footnote)
        }
        .contentShape(Rectangle())
        .onTapGesture(perform: edit)
        .accessibilityAddTraits(.isButton)
        .accessibilityAction(named: "Edit", edit)
    }
}
