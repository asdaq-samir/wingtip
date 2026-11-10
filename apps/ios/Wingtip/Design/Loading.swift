import SwiftUI

extension View {
    /// Rows still on their way, drawn in their own layout with placeholder
    /// words that the system greys out (`.redacted(reason: .placeholder)`),
    /// in place of the hand-built skeleton (the owner, 2026-11-10: stock
    /// over hand-built). VoiceOver reads the one `label` ("Fetching
    /// NOTAMs"), not the placeholder words.
    func loading(_ label: String) -> some View {
        redacted(reason: .placeholder)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(label)
    }
}
