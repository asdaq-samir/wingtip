import Testing
@testable import Wingtip

/// The card rule's one way to open a card or a page (the owner,
/// 2026-11-10): one card at a time over the plan, what a card opens pushed
/// in its own stack, a page done going back to where it was opened from.
@MainActor
struct NavigatorTests {
    /// Every card opens half way, a page as a thing does, and Emergency
    /// alone all the way up (the owner, 2026-11-13: one card rule,
    /// "natively, but stay consistent").
    @Test func everyCardOpensHalfWayAndEmergencyFull() throws {
        let nav = Navigator()
        nav.open(.airport("KOSH"))
        #expect(nav.card?.page == .airport("KOSH") && nav.cardDetent == .half)
        nav.open(.screen(.setup))
        #expect(nav.card?.page == .screen(.setup) && nav.cardDetent == .half)
        nav.open(.emergency)
        #expect(nav.card?.page == .emergency && nav.cardDetent == .large)
    }

    @Test func aCardTakesTheOnesPlaceRatherThanPilingUp() throws {
        let nav = Navigator()
        nav.open(.airport("KOSH"))
        nav.push(.notams(.field("KOSH")))
        nav.open(.airport("KDLH"))
        #expect(nav.card?.page == .airport("KDLH"))
        #expect(nav.cardPath.isEmpty)
    }

    @Test func whatACardOpensStaysInItsStack() throws {
        let nav = Navigator()
        nav.push(.screen(.brief))
        #expect(nav.card?.page == .screen(.brief))
        nav.push(.screen(.airplane))
        nav.push(.screen(.airplane))
        #expect(nav.cardPath == [.screen(.airplane)])
        #expect(nav.top == .screen(.airplane))
    }

    @Test func aPageDoneGoesBackWhereItWasOpened() throws {
        let nav = Navigator()
        nav.open(.airport("KOSH"))
        nav.push(.hold("OSH"))
        nav.finish(.hold("OSH"))
        #expect(nav.card?.page == .airport("KOSH") && nav.cardPath.isEmpty)
        nav.finish(.airport("KOSH"))
        #expect(nav.card == nil)
    }

    @Test func theSwipedAwayCardIsClosed() throws {
        let nav = Navigator()
        nav.open(.screen(.navlog))
        nav.push(.leg(2))
        nav.presented = nil
        #expect(nav.card == nil && nav.cardPath.isEmpty)
    }

    @Test func theIPadKeepsPagesInTheSidebarAndThingsInTheInspector() throws {
        let nav = Navigator()
        nav.split = true
        nav.open(.screen(.setup))
        #expect(nav.card == nil && nav.planPath == [.screen(.setup)])
        nav.push(.screen(.logbook))
        #expect(nav.planPath == [.screen(.setup), .screen(.logbook)])
        nav.open(.airport("KOSH"))
        #expect(nav.card?.page == .airport("KOSH"))
    }

    @Test func aSceneComesBackToItsCardAndItsPages() throws {
        let nav = Navigator()
        nav.open(.screen(.setup))
        nav.push(.screen(.logbook))
        let kept = SheetPage.store(nav.stored)
        let back = Navigator()
        back.restore(SheetPage.restore(kept))
        #expect(back.card?.page == .screen(.setup) && back.cardPath == [.screen(.logbook)])
    }

    @Test func flyHereLandsOnFplAndTheEmptyRoutesCloseGoesBackToTheCard() throws {
        let nav = Navigator()
        // Fly Here from a field's card, twice to the same field: FPL each time.
        for _ in 0..<2 {
            nav.open(.airport("KOSH"))
            nav.sheetPage = .search
            nav.showPlan()
            #expect(nav.card == nil && nav.sheetPage == .fpl)
        }
        // The route cleared, its empty box's close: the card, over Search.
        nav.closeEmptyRoute()
        #expect(nav.card?.page == .airport("KOSH") && nav.sheetPage == .search)
        // Again with no card to go back to: Search alone.
        nav.close()
        nav.sheetPage = .fpl
        nav.closeEmptyRoute()
        #expect(nav.card == nil && nav.sheetPage == .search)
    }

    @Test func aCardOpenedOverSearchClosesBackToSearch() throws {
        let nav = Navigator()
        nav.sheetPage = .search
        nav.open(.airport(AirportRoute.nearby(.fuel).text))
        nav.close()
        #expect(nav.sheetPage == .search)
    }

    @Test func theMapCardIsKeptAndTheFlightsCardsAreNot() throws {
        #expect(SheetPage(stored: "+map") == .mapSettings)
        #expect(SheetPage.traffic("a1b2c3").stored == nil)
        #expect(SheetPage.hold("OSH").ownClose && !SheetPage.mapSettings.ownClose)
    }
}
