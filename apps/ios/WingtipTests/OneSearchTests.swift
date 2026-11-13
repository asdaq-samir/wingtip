import Testing
@testable import Wingtip

/// The one search's pure parts (the owner's one-search design,
/// 2026-11-09): the Do rows for what is typed, the words that open a
/// screen, and the sheet's pages as a scene keeps them.
@MainActor
struct OneSearchTests {
    @Test func oneIdentOnARouteOffersTheFlightToItDirectToAndAskLast() throws {
        let rows = SearchActions.list(for: "KOSH", routed: true, firstIdent: nil)
        #expect(rows.first == .route(dep: nil, stops: [], dest: "KOSH"))
        #expect(rows.contains(.directTo("KOSH")))
        #expect(rows.last == .ask("KOSH"))
        #expect(rows.map(\.title).contains("Direct To KOSH"))
    }

    @Test func directToNeedsARoute() throws {
        let rows = SearchActions.list(for: "KOSH", routed: false, firstIdent: "KOSH")
        #expect(!rows.contains(.directTo("KOSH")))
    }

    @Test func twoIdentsAreARoutePlanned() throws {
        let rows = SearchActions.list(for: "C81 KDLH", routed: false, firstIdent: nil)
        #expect(rows.first == .route(dep: "C81", stops: [], dest: "KDLH"))
        #expect(rows.first?.title == "Plan C81 → KDLH")
    }

    @Test func aScreensNameOrWordOffersIt() throws {
        #expect(SearchActions.list(for: "brief", routed: true, firstIdent: nil).contains(.open(.brief)))
        #expect(SearchActions.list(for: "nav", routed: true, firstIdent: nil).contains(.open(.navlog)))
        #expect(SearchActions.list(for: "mayday", routed: false, firstIdent: nil).contains(.open(.emergency)))
        #expect(SearchActions.list(for: "nearest fuel", routed: false, firstIdent: nil).contains(.open(.nearest)))
        // The plan, the search and a shared flight are never offered by name.
        #expect(!SearchActions.offered.contains(.fpl))
        #expect(!SearchActions.offered.contains(.airport))
        #expect(!SearchActions.offered.contains(.shared))
    }

    @Test func aQuestionIsAskedAndNothingTypedOffersNothing() throws {
        let rows = SearchActions.list(for: "What's the crosswind at KDLH?", routed: true, firstIdent: "KDLH")
        #expect(rows.last == .ask("What's the crosswind at KDLH?"))
        #expect(SearchActions.list(for: "  ", routed: true, firstIdent: nil).isEmpty)
    }

    @Test func everyFieldWordWithAScreenOpensThatScreen() throws {
        #expect(SearchActions.screen(.saved) == .flights)
        #expect(SearchActions.screen(.setup) == .setup)
        #expect(SearchActions.screen(.dryrun) == .profile)
        #expect(SearchActions.screen(.instructor) == nil)
    }

    @Test func theSheetsPagesComeBackWithTheScene() throws {
        let path: [SheetPage] = [.screen(.setup), .screen(.logbook), .airport("KDLH"), .practice, .flight("notes")]
        let kept = SheetPage.store(path)
        #expect(SheetPage.restore(kept) == [.screen(.setup), .screen(.logbook), .airport("KDLH"), .practice])
        #expect(SheetPage.restore(nil).isEmpty)
        // The plan and the search are not pages, so never come back as one.
        #expect(SheetPage(stored: "fpl") == nil)
        #expect(SheetPage(stored: "airport") == nil)
        #expect(SheetPage(stored: "@") == nil)
    }

    @Test func theInspectorsCardsAreTheThingsTheBriefTheProfileAndTheFlights() throws {
        #expect(SheetPage.screen(.brief).inspects)
        #expect(SheetPage.screen(.profile).inspects)
        #expect(SheetPage.screen(.flights).inspects)
        #expect(!SheetPage.screen(.navlog).inspects)
        #expect(SheetPage.airport("KDLH").inspects)
        #expect(SheetPage.traffic("a1b2c3").inspects && SheetPage.mapSettings.inspects)
    }

    @Test func theAirportCardsActionsAreTheDesignsInOrder() throws {
        // The web's four in the head; Depart From is in the foot's Add to
        // Plan menu since the airport card took the web's actions.
        #expect(CardKind.airport.actions.map(\.title) == ["Fly Here", "Add as Stop", "Call", "Favorite"])
    }
}
