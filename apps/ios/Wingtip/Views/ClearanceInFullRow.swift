import SwiftUI

/// Under the clearance's words: the same clearance said in full by Apple's
/// on-device model, where the engine reads more from it and nothing
/// different (ClearanceInFull), with what it adds and Use These Words,
/// which puts them in the field for the engine to read. Nothing changes
/// until the pilot taps; hidden where Apple Intelligence cannot run.
struct ClearanceInFullRow: View {
    let text: String
    let use: (String) -> Void
    var model: ClearanceInFull.Model = ClearanceInFull.apple
    @State private var offer: ClearanceInFull.Offer?
    @State private var offerFor: String?

    var body: some View {
        Group {
            if let offer, offerFor == text {
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    Label("Said in Full", systemImage: "sparkles")
                        .font(WingtipType.note.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("“\(offer.said)”")
                    Text("The engine reads the \(ListFormatter.localizedString(byJoining: offer.adds)) in these words too.")
                        .font(WingtipType.note).foregroundStyle(.secondary)
                    Button("Use These Words") { use(offer.said) }
                        .glassButton()
                }
                .accessibilityElement(children: .contain)
            }
        }
        .task(id: text) {
            guard ClearanceInFull.available, !text.trimmingCharacters(in: .whitespaces).isEmpty else { return }
            // Once the words stop changing, as the place look-up waits.
            try? await Task.sleep(for: .milliseconds(700))
            guard !Task.isCancelled else { return }
            let heard = text
            let found = await ClearanceInFull.ask(heard, model: model)
            guard !Task.isCancelled else { return }
            offer = found
            offerFor = heard
        }
    }
}
