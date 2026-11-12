import SwiftUI

/// The ATC copilot's card under a call to us (AtcCopilot): each item the
/// engine read, in the words ATC uses, then the readback's result once
/// heard -- a tick where it matched, else each item missed or said
/// differently -- and Read Back. Nothing is set from here.
struct AtcCardRows: View {
    @Environment(AtcCopilot.self) private var atc
    let card: AtcCopilot.Card
    let tail: String?

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            ForEach(Array(card.items.enumerated()), id: \.offset) { _, item in
                Text(item.words).font(.subheadline.weight(.semibold)).monospacedDigit()
                    .frequencyActions(item.kind == "frequency" ? item.mhz : nil)
            }
            if let readback = card.readback {
                let complete = readback.check.items.isEmpty
                ForEach(AtcCopilot.readbackLines(readback.check), id: \.self) { line in
                    Label(line, systemImage: complete ? "checkmark" : "exclamationmark.circle")
                        .font(.footnote).foregroundStyle(complete ? Color.secondary : WingtipInk.caution)
                }
            }
            if card.awaiting {
                Text("Read it back…").font(.footnote).foregroundStyle(.secondary)
            } else {
                Button(card.readback == nil ? "Read Back" : "Read Back Again") {
                    Task { await atc.readBack(card.id, tail: tail) }
                }
                .glassButton().buttonBorderShape(.capsule)
            }
        }
        .accessibilityElement(children: .contain)
    }
}

/// Setup's Alerts: the ATC copilot off, or listening while flying.
/// Turned on with the microphone not yet asked for, why is said first and
/// the system's question comes on Allow (PermissionAsk); Not Now leaves it off.
struct AtcModePicker: View {
    @Environment(AtcCopilot.self) private var atc
    @State private var askingMicrophone = false

    var body: some View {
        Picker("ATC", selection: Binding(get: { atc.mode }, set: { pick($0) })) {
            ForEach(AtcCopilot.Mode.allCases) { Text($0.label).tag($0) }
        }
        .pickerStyle(.segmented)
        .sheet(isPresented: $askingMicrophone) {
            PermissionAsk(permission: .microphone, allow: {
                askingMicrophone = false
                Task { if await ClearanceListener.allowed() { atc.mode = .flying } }
            }, notNow: { askingMicrophone = false })
                .presentationDetents([.medium])
        }
    }

    private func pick(_ mode: AtcCopilot.Mode) {
        guard mode == .flying else { atc.mode = mode; return }
        Task {
            if await Permission.undecided(.microphone) { askingMicrophone = true } else { atc.mode = mode }
        }
    }
}
