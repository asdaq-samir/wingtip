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
    /// a page on the sidebar's stack. Set as the window's size classes
    /// change (RootView), and what is open moves to where the new layout
    /// keeps it (relayout).
    var split = false {
        didSet { if split != oldValue { relayout() } }
    }
    /// The screens' models a card going away lets go of (left); the app
    /// gives them (WingtipApp), a preview's navigator has none.
    @ObservationIgnored var screens: ScreenModels?
    /// The sidebar's stack on the iPad, the plan at its root. The iPhone's
    /// plan has no page pushed on it: every page is a card.
    var planPath: [SheetPage] = []
    /// The card over the plan, nil with none.
    private(set) var card: Card?
    /// The pages pushed inside the card.
    var cardPath: [SheetPage] = []
    /// The chart beside the map on the iPad (SplitLayout's BesidePane): a
    /// plate with own ship on it, the diagram, any FAA chart, standing in
    /// its own column while cards come and go in the inspector. Nil, none.
    var beside: PictureRequest?
    /// The plan's sheet's page, Search or FPL (SheetPager): kept here so a
    /// link, Siri and every "show the plan" turn it.
    var sheetPage: PlanPage = .search
    /// The field's card the plan was shown from (Fly Here, Depart From,
    /// Add Stop): where the empty route box's close goes back to, a
    /// level back, as the web's clearRoute goes back to the airport flown
    /// to (`under`).
    private(set) var planFrom: SheetPage?
    /// An Add's ask of the one search for an airplane (the owner,
    /// 2026-11-14: the airplanes' Adds go to the one search), which the
    /// root hands the search and clears.
    var airplaneAsked: OneSearchModel.Keeping?
    /// The document open in the reader over this window, and where in it
    /// (ReaderCover): a cite tapped, a library row, a link's `doc=`.
    var reading: DocPlace?

    /// The cards put away and the one search up for an airplane to fly as
    /// the pilot's or to keep, its placeholder saying which.
    func searchAirplane(_ keeping: OneSearchModel.Keeping) {
        close()
        planPath = []
        sheetPage = .search
        airplaneAsked = keeping
    }

    /// The card's height on the iPhone: half way, as Maps opens a place,
    /// for every card but the emergency assistant's (SheetPage.opensFull);
    /// the pilot's drag sets it from there.
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

    /// A plan's page from the menu bar (View > Search, FPL): the card put
    /// away so the page is in sight, as the toggle on the map turns it.
    func showPage(_ page: PlanPage) {
        close()
        planPath = []
        sheetPage = page
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

    /// The window crossed the size classes with something open (an iPad
    /// window resized in Stage Manager or Split View, iPhone Duo folded):
    /// what the pilot had open stays in sight, moved to where the new
    /// layout keeps it, as HIG Layout asks ("Keep functionality the same
    /// as size classes change"). To the iPad's layout, a page that is not
    /// a thing leaves the card for the sidebar's stack, its own stack with
    /// it; to the sheet, where the plan has no page pushed, the sidebar's
    /// pages become the card and its stack, unless a card is up, which is
    /// what was in front. Moved, not closed: nothing a card held is let go
    /// of (left), so a flight logged or the emergency assistant stays open.
    private func relayout() {
        if split {
            guard let page = card?.page, !page.inspects else { return }
            planPath = [page] + cardPath
            cardPath = []
            card = nil
        } else {
            if card == nil, let first = planPath.first {
                cardDetent = first.opensFull ? .large : .half
                card = Card(page: first)
                cardPath = Array(planPath.dropFirst())
            }
            planPath = []
        }
    }

    /// The card changed: what the one going away held let go of, as its
    /// own close would (the airplane no longer tracked,
    /// the shared flight not taken, the flight logged later).
    private func set(_ next: Card?) {
        let was = card
        card = next
        guard let was, was != next else { return }
        left(was.page, for: next?.page)
    }

    private func left(_ page: SheetPage, for next: SheetPage?) {
        switch page {
        case .traffic:
            if case .traffic = next {} else { screens?.flight.tracking.track(nil) }
        case .sharedFlight:
            if let shared = screens?.sharedFlight, shared.showing { shared.notNow() }
        case .flightLogged:
            guard let model = screens?.autoLogbook else { break }
            if model.isOpen { if model.logged != nil { model.close() } else { model.later() } }
        case .clearance:
            ClearanceListener.shared.sheetShown = false
        case .emergency:
            if let emergency = screens?.emergency, emergency.open != nil { emergency.close() }
        default:
            break
        }
    }
}
