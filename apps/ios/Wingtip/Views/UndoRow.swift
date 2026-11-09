import SwiftUI

/// "Removed C81 → KDLH · Undo" in the list the thing went from, for a few
/// seconds after a delete, as the route's UndoBar is for the route: the
/// result where it happened, never a toast (docs/navigation.md). `done`
/// runs when the time is up, so a delete can wait for it to be kept.
struct UndoRow: View {
    let words: String
    let undo: () -> Void
    let done: () -> Void

    var body: some View {
        HStack(spacing: WingtipSpace.md) {
            Label(words, systemImage: "arrow.uturn.backward").lineLimit(1)
            Spacer(minLength: 0)
            Button("Undo", action: undo)
                .fontWeight(.semibold)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityElement(children: .contain)
        .task(id: words) {
            AccessibilityNotification.Announcement(words).post()
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { done() }
        }
    }
}

#Preview("UndoRow") {
    List { UndoRow(words: "Removed C81 → KDLH", undo: {}, done: {}) }
}
