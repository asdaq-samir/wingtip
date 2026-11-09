import SwiftUI

/// A date the pilot may leave unsaid: a button to give one, then the
/// system's date picker with a way to take it off again.
struct OptionalDayRow: View {
    let title: String
    @Binding var day: String?
    var upTo: Date? = nil

    var body: some View {
        if let value = day, let date = Day.date(value) {
            HStack {
                DatePicker(title, selection: Binding(get: { date }, set: { day = Day.string($0) }),
                           in: ...(upTo ?? .distantFuture), displayedComponents: .date)
                Button { day = nil } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        // The 44-point hit area round the glyph, which does not grow.
                        .contentShape(Rectangle().inset(by: -12))
                }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Clear \(title.lowercased())")
            }
        } else {
            LabeledContent(title) {
                Button("Add Date") { day = Day.today() }.buttonStyle(.borderless)
            }
        }
    }
}

/// How a last good day stands today: green to it, red past it. The day
/// is the gateway's.
struct StandingText: View {
    let through: String?
    var good = "To"
    var past = "Past due since"

    var body: some View {
        if let through {
            let current = Day.current(through)
            Text("\(current ? good : past) \(Day.said(through))").foregroundStyle(current ? Color.green : Color.red)
        }
    }
}
