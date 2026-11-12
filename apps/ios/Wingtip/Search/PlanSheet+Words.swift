import SwiftUI

/// A screen by the word typed or said into the one search (FieldCommands'
/// FieldScreen), opened from the plan's sheet: the page by that name, or
/// the plan where the word is one of its own sections; why not, in the
/// web app's words, where the plan is not far enough along for it.
extension PlanSheet {
    func word(for word: FieldScreen) -> String? {
        let routed = plan.routed
        switch word {
        case .brief:
            guard routed else { return "Plan a route first: a field, a town or two idents." }
            openScreen(.brief)
        case .navlog:
            guard routed, plan.course != nil else { return "Plan a route first." }
            openScreen(.navlog)
        case .altitude, .profile:
            guard routed, plan.profile != nil else { return "Plan a route first; then say an altitude, \"altitude 5500\"." }
            openScreen(.profile)
        case .dryrun:
            guard routed, plan.profile != nil else { return "Plan a route first." }
            openScreen(.profile)
            return "Dry run is the Profile's button, at the side view's foot."
        case .fuel, .food, .stops:
            // The fuel, food and rest stops are the web app's for now; the
            // nearest fields, which have the fuel, are here.
            openScreen(.nearest)
            return "Stops with fuel and food are on the website for now; these are the nearest fields."
        case .routes, .procedures:
            // Both are the plan's own: Routes under the route's ends, the
            // procedures further down.
            guard routed else { return "Plan a route first, then its other ways are under its ends." }
            showPlan()
        case .share:
            guard routed else { return "Plan a route first." }
            showPlan()
            return "Share is at the plan's bar's left."
        case .file:
            guard routed, plan.totals != nil else { return "A flight plan needs a route from an airport, its nav log in." }
            nav.open(.flight("file"))
        case .clearance, .radio:
            showPlan()
            listener.sheetText = nil
            listener.sheetShown = true
        case .instructor:
            nav.open(.instructing)
        case .recents:
            shelf.show(.recents)
            nav.open(.airport(AirportRoute.list(.recents).text))
        case .map:
            // The Map card, the map's own button's (MapSettingsView).
            nav.open(.mapSettings)
        case .airplane, .logbook, .setup, .nearest, .saved, .recentRoutes, .favorites, .emergency:
            if let screen = SearchActions.screen(word) { openScreen(screen) }
        }
        return nil
    }
}
