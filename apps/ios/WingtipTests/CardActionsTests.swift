import Testing
@testable import Wingtip

/// Each card kind's actions are design/card-actions.json's, generated
/// (scripts/build/card-actions.sh) into CardKind as into the web's
/// CARD_ACTIONS, and the airport card's row draws its kind's list.
@Suite struct CardActionsTests {
    @Test func eachCardKindOffersTheDesignsActionsInItsOrder() {
        #expect(CardKind.airport.actions.map(\.title) == ["Fly Here", "Add Stop", "Call", "Favorite"])
        #expect(CardKind.airportAsStop.actions.map(\.title) == ["Add Stop", "Call", "Favorite", "Address"])
        #expect(CardKind.airportStopOff.actions.map(\.title) == ["Fly Here", "Call", "Favorite", "Address"])
        #expect(CardKind.point.actions.map(\.title) == ["Direct To", "Add to Route", "Hold Here"])
        #expect(CardKind.navaid.actions.map(\.title) == ["Direct To", "Add to Route", "Copy"])
    }

    @Test func theAirportCardsTilesAreItsKindsInOrder() {
        // The tiles carry the web's test ids, so the row, in order, is the
        // generated table's, as PlaceActions.test.tsx holds the web's.
        let open = AirportPlaceHead.actionKind(stopOff: false).actions.map(AirportPlaceHead.identifier)
        #expect(open == ["fly-here", "place-add-stop", "place-call", "place-favorite"])
        // Where the field cannot be a stop now, Address in Add Stop's place.
        let off = AirportPlaceHead.actionKind(stopOff: true).actions.map(AirportPlaceHead.identifier)
        #expect(off == ["fly-here", "place-call", "place-favorite", "place-address-action"])
    }

    @Test func oneActionHasOneGlyphAndOneWordOnEveryCard() {
        // Add Stop and Add to Route are one concept's glyph, Fly Here and
        // Direct To another's, as the concept table draws them.
        #expect(CardAction.addStop.systemImage == CardAction.addToRoute.systemImage)
        #expect(CardAction.flyHere.systemImage == CardAction.directTo.systemImage)
        #expect(CardAction.flyHere.title == Wording.flyHere && CardAction.call.title == Wording.call)
        #expect(Set(CardAction.allCases.map(\.title)).count == CardAction.allCases.count)
    }
}
