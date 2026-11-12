import Observation
import SwiftUI

/// Where every card and page opens, the one way (the owner's card rule,
/// 2026-11-10): a thing -- a field, an airplane, a leg, a hold, the Map
/// settings -- and every page by its name opens as one card over the
/// plan's sheet with its close, as Apple Maps opens a place over its
/// search; anything opened inside a card is pushed in the card's own
/// stack, with Back. On the iPhone the card is a sheet the plan's sheet
/// presents (CardHost), so there is one presenter and one card at a time;
/// on the iPad the inspector holds it beside the map (SplitLayout) and the
/// other pages stay in the sidebar's stack. One for the app, handed down
/// the views in the environment (WingtipApp).
@MainActor
@Observable
final class Navigator {
    /// The card up, by the page at its root.
    struct Card: Identifiable, Hashable {
        let page: SheetPage
        var id: SheetPage { page }
    }

    /// The iPad's layout (SplitLayout): a thing opens in the inspector,
    /// a page on the sidebar's stack.
    var split = false
    /// The sidebar's stack on the iPad, the plan at its root. The iPhone's
    /// plan has no page pushed on it: every page is a card.
    var planPath: [SheetPage] = []
    /// The card over the plan, nil with none.
    private(set) var card: Card?
    /// The pages pushed inside the card.
    var cardPath: [SheetPage] = []
    /// The plan's sheet's page, Search or FPL (SheetPager): kept here so a
    /// link, Siri and every "show the plan" turn it.
    var sheetPage: PlanPage = .search
    /// The field's card the plan was shown from (Fly Here, Depart From,
    /// Add as Stop): where the empty route box's close goes back to, a
    /// level back, as the web's clearRoute goes back to the airport flown
    /// to (`under`).
    private(set) var planFrom: SheetPage?
    /// The card's height on the iPhone: half way for a thing, as Maps
    /// opens a place, full for a page.
    var cardDetent: PresentationDetent = .half

    /// The page on top: the card's last, else its root, else the sidebar's.
    var top: SheetPage? { cardPath.last ?? card?.page ?? planPath.last }

    /// The field or point whose card is in sight, for the map's ring.
    var heldRoute: String? {
        ([card?.page].compactMap { $0 } + cardPath + planPath).last(where: { $0.airportRoute != nil })?.airportRoute
    }

    /// Opens `page` as the card, in place of any card up (a field tapped
    /// on the map after another takes its place rather than piling up);
    /// on the iPad a page that is not a thing goes on the sidebar's stack.
    func open(_ page: SheetPage) {
        if split, !page.inspects {
            set(nil)
            planPath = [page]
            return
        }
        cardPath = []
        cardDetent = page.opensFull ? .large : .half
        set(Card(page: page))
    }

    /// Opens `page` from where the pilot is: inside the card up, pushed on
    /// its stack (rule 2: what a card opens stays in it); with none, as
    /// the card, or on the iPad's sidebar.
    func push(_ page: SheetPage) {
        if card != nil {
            // The page on top asked for again: already in sight.
            if top != page { cardPath.append(page) }
        } else if split, !page.inspects {
            planPath.append(page)
        } else {
            open(page)
        }
    }

    /// A page done (an edit form's Cancel or Add, a question answered):
    /// popped where it was pushed, the card closed where it is the root.
    func finish(_ page: SheetPage) {
        if cardPath.last == page {
            cardPath.removeLast()
        } else if card?.page == page {
            close()
        } else if planPath.last == page {
            planPath.removeLast()
        }
    }

    /// The card put away (its close, a swipe down, Escape).
    func close() {
        cardPath = []
        set(nil)
    }

    /// The plan in sight: the card closed, the sidebar back to its root and
    /// the sheet on its FPL page, as a route made or opened shows it (the
    /// carousel, 2026-11-11).
    func showPlan() {
        if let page = card?.page, page.airportRoute != nil { planFrom = page }
        close()
        planPath = []
        sheetPage = .fpl
    }

    /// The empty route box's close (PlanView), a level back: the field's
    /// card the plan was shown from, over the Search page, else the Search
    /// page itself (the web's clearRoute, its second step).
    func closeEmptyRoute() {
        sheetPage = .search
        if let from = planFrom {
            planFrom = nil
            open(from)
        }
    }

    /// The card, as the system sheet's item binding sets it: nil once the
    /// pilot swipes it away.
    var presented: Card? {
        get { card }
        set { if newValue == nil { close() } else if newValue != card { set(newValue) } }
    }

    /// The pages a scene keeps (SceneStorage): the card's and its stack's
    /// on the iPhone, the sidebar's on the iPad.
    var stored: [SheetPage] { split ? planPath : [card?.page].compactMap { $0 } + cardPath }

    /// A scene's pages brought back: the first the card, the rest pushed
    /// in it; the sidebar's on the iPad.
    func restore(_ pages: [SheetPage]) {
        if split {
            planPath = pages
        } else if let first = pages.first {
            open(first)
            cardPath = Array(pages.dropFirst())
        }
    }

    /// The card changed: what the one going away held let go of, as its
    /// own close would (the airplane no longer tracked,
    /// the shared flight not taken, the flight logged later).
    private func set(_ next: Card?) {
        let was = card
        card = next
        guard let was, was != next else { return }
        Self.left(was.page, for: next?.page)
    }

    private static func left(_ page: SheetPage, for next: SheetPage?) {
        switch page {
        case .traffic:
            if case .traffic = next {} else { Tracking.shared.track(nil) }
        case .sharedFlight:
            if SharedFlightModel.shared.showing { SharedFlightModel.shared.notNow() }
        case .flightLogged:
            let model = AutoLogbook.shared
            if model.isOpen { if model.logged != nil { model.close() } else { model.later() } }
        case .clearance:
            ClearanceListener.shared.sheetShown = false
        default:
            break
        }
    }
}
