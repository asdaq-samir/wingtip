import SwiftUI

/// The four parts of the clearance step in a row (Hear, Read back, Enter,
/// Compare): done in green, the one now in the tint, the rest to come.
struct ClearanceStepsRow: View {
    @Environment(\.lookAccent) private var accent
    /// Where each of the four parts stands.
    enum Standing { case done, now, later }

    let heard: Bool
    let readBack: Bool
    let ready: Bool

    private var parts: [(name: String, standing: Standing)] {
        let readBack = heard && readBack
        return [
            ("Hear", heard ? .done : .now),
            ("Read back", readBack ? .done : (heard ? .now : .later)),
            ("Enter", readBack && ready ? .now : .later),
            ("Compare", ready ? .done : .later),
        ]
    }

    var body: some View {
        HStack(spacing: WingtipSpace.sm) {
            ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                Text("\(i + 1) \(part.name)")
                    .font(.caption)
                    .fontWeight(part.standing == .later ? .regular : .semibold)
                    .foregroundStyle(part.standing == .done ? WingtipInk.go : part.standing == .now ? accent : Color.secondary)
                    .frame(maxWidth: .infinity)
                    .accessibilityLabel("\(part.name), \(part.standing == .done ? "done" : part.standing == .now ? "now" : "to come")")
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The pilot's read back, checked line by line by the engine
/// (ReadbackCheck), or how to give one.
struct ClearanceReadbackSection: View {
    let clearance: Clearance
    let readback: String
    let readingBack: Bool
    let check: ReadbackCheck?

    var body: some View {
        Section("Your Read Back") {
            if readback.isEmpty {
                Text(readingBack ? "Listening for your read back…"
                    : "Read it back to ATC with Read back again, and it is checked here line by line.")
                    .foregroundStyle(.secondary)
            } else {
                Text("“\(readback)”").foregroundStyle(.secondary)
                if let check {
                    ForEach(ReadbackCheck.lines(clearance, check)) { line in
                        Label {
                            Text(line.words)
                        } icon: {
                            Image(systemName: line.ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                                .foregroundStyle(line.ok ? WingtipInk.go : WingtipInk.caution)
                                .accessibilityLabel(line.ok ? "Read back" : "Differs")
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else {
                    Text("The read back could not be checked.").foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// The route cleared against the one filed (ClearanceCompare).
struct ClearanceCompareSection: View {
    let difference: ClearanceCompare.Difference

    var body: some View {
        Section {
            Label {
                difference.same ? Text(difference.words)
                    : Text("\(Text("Differs from what you filed: ").bold())\(difference.words)")
            } icon: {
                Image(systemName: difference.same ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                    .foregroundStyle(difference.same ? WingtipInk.go : WingtipInk.caution)
                    .accessibilityLabel(difference.same ? "As filed" : "Differs")
            }
            .accessibilityElement(children: .combine)
        }
        .listRowBackground(difference.same ? nil : WingtipInk.caution.opacity(0.12))
    }
}

/// The radio as heard, newest first, a call to us in the tint: a tap
/// reads that one above.
struct ClearanceHeardLog: View {
    @Environment(\.lookAccent) private var accent
    let heard: [ClearanceListener.Transmission]
    let pick: (String) -> Void

    var body: some View {
        let log = heard.filter(\.final).reversed().prefix(10)
        ForEach(Array(log)) { t in
            Button {
                pick(t.text)
            } label: {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text(t.text).foregroundStyle(t.forUs ? accent : Color.primary).fontWeight(t.forUs ? .semibold : .regular)
                    Text(t.at, style: .time).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}
