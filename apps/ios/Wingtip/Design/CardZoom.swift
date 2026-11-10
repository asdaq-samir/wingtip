import SwiftUI

/// A card opened from its row grows out of the row, iOS's zoom navigation
/// transition (iOS 18), the way Photos and Maps open an item; with Reduce
/// Motion on, a cross-fade (iOS 27), or the stack's own push before it.
extension View {
    /// The row a card opens from, by the card's id.
    func cardSource(_ id: some Hashable, in space: Namespace.ID) -> some View {
        matchedTransitionSource(id: id, in: space)
    }

    /// The card, zooming from its row where there is one.
    func zoomsFrom(_ id: some Hashable, in space: Namespace.ID) -> some View {
        modifier(CardZoom(id: AnyHashable(id), space: space))
    }

    /// A stack whose rows open cards (the nav log's legs, a field's row,
    /// a flown flight): one namespace for its rows and cards to zoom in,
    /// put on the NavigationStack so its pages see it as well.
    func cardZoomStack() -> some View { modifier(CardZoomStack()) }

    /// The row a card opens from, in the stack's namespace (cardZoomStack);
    /// unchanged outside one.
    func cardSource(_ id: some Hashable) -> some View { modifier(StackCardSource(id: AnyHashable(id))) }

    /// The card, zooming from its row in the stack's namespace.
    func zoomsFrom(_ id: some Hashable) -> some View { modifier(StackCardZoom(id: AnyHashable(id))) }
}

private struct CardZoom: ViewModifier {
    let id: AnyHashable
    let space: Namespace.ID
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if reduceMotion {
            // iOS 27's cross-fade, the HIG's way to show a change without
            // movement (HIG, Accessibility: Motion); the stack's push before it.
            if #available(iOS 27.0, *) { content.navigationTransition(.crossFade) } else { content }
        } else {
            content.navigationTransition(.zoom(sourceID: id, in: space))
        }
    }
}

extension EnvironmentValues {
    /// The namespace of the stack's card zooms (cardZoomStack), nil outside one.
    @Entry var cardZoomSpace: Namespace.ID?
}

private struct CardZoomStack: ViewModifier {
    @Namespace private var space

    func body(content: Content) -> some View {
        content.environment(\.cardZoomSpace, space)
    }
}

private struct StackCardSource: ViewModifier {
    let id: AnyHashable
    @Environment(\.cardZoomSpace) private var space

    func body(content: Content) -> some View {
        if let space { content.matchedTransitionSource(id: id, in: space) } else { content }
    }
}

private struct StackCardZoom: ViewModifier {
    let id: AnyHashable
    @Environment(\.cardZoomSpace) private var space

    func body(content: Content) -> some View {
        if let space { content.modifier(CardZoom(id: id, space: space)) } else { content }
    }
}
