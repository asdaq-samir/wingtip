import Foundation
import Testing
@testable import Wingtip

/// The airplane card's four actions (AirplaneActionState), as the web's
/// AirplaneCard Actions has them: the row's kind by its state from the
/// generated table, and each greyed, never hidden, where it can't be used.
struct AirplaneActionsTests {
    static let base = AirplaneActionState(name: "N3429J", hex: "a3e2b1", airborne: false, heard: false, tracked: false,
                                          tail: "N3429J", booked: true, owned: false, flying: false, kept: nil)

    @Test func theRowIsTheGeneratedTablesForItsState() {
        #expect(Self.base.kind.actions == [.flyThis, .alerts, .favorite, .figures])
        var air = Self.base
        air.airborne = true
        #expect(air.kind.actions == [.track, .alerts, .favorite, .figures])
        // Four always, in their places.
        #expect(Self.base.kind.actions.count == 4 && air.kind.actions.count == 4)
    }

    @Test func flyThisAndFiguresNeedAnNNumberThePlannerCanFly() {
        #expect(Self.base.flyable)
        var unbooked = Self.base
        unbooked.booked = false
        #expect(!unbooked.flyable)
        // The pilot's own, or the one flown, flies on the pilot's figures.
        unbooked.owned = true
        #expect(unbooked.flyable)
        unbooked.owned = false
        unbooked.flying = true
        #expect(unbooked.flyable)
        var foreign = Self.base
        foreign.tail = nil
        #expect(!foreign.flyable)
    }

    @Test func trackIsForAnAirplaneHeardNow() {
        var air = Self.base
        air.airborne = true
        air.tracked = true
        #expect(!air.trackable && !air.following)
        air.heard = true
        #expect(air.trackable && air.following)
        air.tracked = false
        #expect(air.trackable && !air.following)
    }

    @Test func eachTileHasTheWebsTestId() {
        #expect(AirplaneActions.identifier(.track) == "airplane-track")
        #expect(AirplaneActions.identifier(.flyThis) == "fly-this-airplane")
        #expect(AirplaneActions.identifier(.figures) == "airplane-figures-open")
    }
}
