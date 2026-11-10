import SwiftUI

/// An edit form's Cancel, at the leading edge as HIG Sheets puts it, that
/// asks before an edit is thrown away (the owner's scrolling rule,
/// 2026-11-10: "a form swiped closed asks before throwing away an edit"):
/// with nothing changed it cancels at once; with an edit, the stock
/// confirmation dialog, whose own Cancel keeps the edit. The swipe down is
/// held while there is an edit (formGuard), so Cancel is the one way out.
struct FormCancel: ToolbarContent {
    let edited: Bool
    let cancel: () -> Void
    @Binding var asking: Bool

    var body: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("Cancel") { if edited { asking = true } else { cancel() } }
                .confirmationDialog("Discard your changes?", isPresented: $asking, titleVisibility: .visible) {
                    Button("Discard Changes", role: .destructive) { cancel() }
                    Button("Keep Editing", role: .cancel) {}
                }
        }
    }
}

extension View {
    /// The swipe that would put the form away held while it has an edit,
    /// and Back hidden where it is pushed, so its Cancel asks first.
    func formGuard(edited: Bool) -> some View {
        interactiveDismissDisabled(edited)
            .navigationBarBackButtonHidden()
    }
}
