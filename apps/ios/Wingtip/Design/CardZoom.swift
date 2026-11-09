import SwiftUI

/// A card opened from its row grows out of the row, iOS's zoom navigation
/// transition (iOS 18), the way Photos and Maps open an item; with Reduce
/// Motion on, the stack's own push, which the system then cross-fades.
extension View {
    /// The row a card opens from, by the card's id.
    func cardSource(_ id: some Hashable, in space: Namespace.ID) -> some View {
        matchedTransitionSource(id: id, in: space)
    }

    /// The card, zooming from its row where there is one.
    func zoomsFrom(_ id: some Hashable, in space: Namespace.ID) -> some View {
        modifier(CardZoom(id: AnyHashable(id), space: space))
    }
}

private struct CardZoom: ViewModifier {
    let id: AnyHashable
    let space: Namespace.ID
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            content
        } else {
            content.navigationTransition(.zoom(sourceID: id, in: space))
        }
    }
}
