import SwiftUI

/// The close of a sheet or a card presented over the map, at the right
/// of its bar. A page pushed in a stack goes back with the system's own
/// Back button and edge swipe (the owner, 2026-11-10: stock as is,
/// superseding decision 0015's close on every level). Cancel stays only
/// where it throws away an edit.
///
/// The system's own close (Button(role: .close)), drawn as Liquid Glass
/// in the bar.
struct CloseButton: View {
    let action: () -> Void

    var body: some View {
        // Escape on an iPad's keyboard closes the level too, as the
        // system's own sheets do (the cancel action's shortcut).
        Button(role: .close, action: action)
            .keyboardShortcut(.cancelAction)
    }
}

extension View {
    /// The close at the right of this level's bar, doing `action`.
    func closeButton(_ action: @escaping () -> Void) -> some View {
        toolbar {
            ToolbarItem(placement: .topBarTrailing) { CloseButton(action: action) }
        }
    }
}
