import SwiftUI

/// A step the pilot can take back, offered for a moment after it is made
/// (the web's per-edit Undo toast, e401f646d): what it took away in the
/// UndoManager's own words ("KMSN removed", "Route cleared", "Route
/// replaced"), each offer its own so the same words twice are two, and
/// offered only in the window whose UndoManager holds the step (the
/// plan is every window's; its steps are each window's own).
struct UndoOffer: Equatable, Identifiable, Sendable {
    let id: UUID
    let words: String
    /// The UndoManager the step is in, by identity: nil with none.
    let manager: ObjectIdentifier?

    init(_ words: String, in manager: UndoManager? = nil, id: UUID = UUID()) {
        self.id = id
        self.words = words
        self.manager = manager.map(ObjectIdentifier.init)
    }

    /// Whether the offer is this window's: its step in the window's manager.
    func isIn(_ manager: UndoManager?) -> Bool { self.manager == manager.map(ObjectIdentifier.init) }

    /// How long it stays in sight before it goes by itself: long enough to
    /// read and reach, as Mail's and Photos' undo offers stay; shake, ⌘Z
    /// and the Edit menu still take the step back after it has gone.
    static let shown: Duration = .seconds(6)
}

/// The undo bar at the plan's foot, over the figures strip: the change's
/// words and Undo, in the glass that floats over the map, as iOS offers
/// an undo after a delete (Mail's "Undo", Photos' and Files' bars) and the
/// web's toast does. Undo is the window's UndoManager's, the same step
/// shake and ⌘Z take (Plan.remember registered it), so the bar holds no
/// state of the route's; it goes after `UndoOffer.shown`, on Undo, or when
/// another change takes its place. VoiceOver hears the change as it is
/// made (Plan.remember's announcement), and Undo is the bar's one button.
struct UndoBar: View {
    @Environment(Plan.self) private var plan
    @Environment(\.undoManager) private var undoManager

    var body: some View {
        if let offer = plan.undoOffer, offer.isIn(undoManager) {
            HStack(spacing: WingtipSpace.md) {
                Text(offer.words)
                    .font(WingtipType.row)
                    .foregroundStyle(.primary)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Button {
                    plan.dismissUndo(offer)
                    undoManager?.undo()
                } label: {
                    Text("Undo").font(WingtipType.row.weight(.semibold))
                }
                .buttonStyle(.borderless)
                .hitArea()
                .disabled(!(undoManager?.canUndo ?? false))
                .accessibilityLabel("Undo \(offer.words)")
                .accessibilityIdentifier("undo-bar-undo")
            }
            .padding(.horizontal, WingtipSpace.lg)
            .frame(minHeight: WingtipSize.tapTarget)
            .floatingGlass(in: Capsule())
            .padding(.horizontal, WingtipSpace.lg)
            .padding(.bottom, WingtipSpace.sm)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("undo-bar")
            .task(id: offer.id) {
                try? await Task.sleep(for: UndoOffer.shown)
                plan.dismissUndo(offer)
            }
        }
    }
}
