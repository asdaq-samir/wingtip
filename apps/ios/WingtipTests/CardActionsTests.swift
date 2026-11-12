import Testing
@testable import Wingtip

/// Each card kind's actions, in the web's order and words (CARD_ACTIONS,
/// apps/web/src/lib/cardActions.ts; docs/design/icons.md).
@Suite struct CardActionsTests {
    @Test func eachCardKindOffersTheWebsActionsInItsOrder() {
        #expect(CardKind.airport.actions.map(\.title) == ["Fly Here", "Add as Stop", "Call", "Favorite"])
        #expect(CardKind.point.actions.map(\.title) == ["Direct To", "Add to Route", "Hold Here"])
        #expect(CardKind.navaid.actions.map(\.title) == ["Direct To", "Add to Route", "Copy"])
    }

    @Test func oneActionHasOneGlyphOnEveryCard() {
        // Add Stop and Add to Route are one concept's glyph, Fly Here and
        // Direct To another's, as the concept table draws them.
        #expect(CardAction.addStop.systemImage == CardAction.addToRoute.systemImage)
        #expect(CardAction.flyHere.systemImage == CardAction.directTo.systemImage)
        #expect(Set(CardAction.allCases.map(\.title)).count == CardAction.allCases.count)
    }
}
