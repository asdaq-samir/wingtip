import SwiftUI

/// The plan's sheet: two pages swiped between sideways under their dots
/// (the owner's carousel, 2026-11-11; SheetPager), Search -- the one
/// search with the microphone and the account button beside the field,
/// over Favorites, Recents, Find Nearby and Nearest -- and FPL, the plan.
/// Every card and page opened from either -- a field's card, the Brief,
/// the nav log, the airplane, Settings and its pages -- is one card over
/// both with its close (Navigator, CardHost), as Maps opens a place over
/// its search, and its close comes back to the page it was opened on. On
/// the iPad the same two pages in the sidebar, its pages pushed there and
/// its things in the inspector.
struct PlanSheet: View {
    @Environment(Plan.self) var plan
    @Environment(\.splitLayout) private var split
    @Environment(\.sheetAtPill) private var atPill
    let search: OneSearchModel
    /// A screen by its name, as a link opens it (RootView.openScreen): the
    /// one way a page opens by name.
    let openScreen: (Screen) -> Void
    /// Ask, with the question when there is one.
    let ask: (String?) -> Void

    var body: some View {
        @Bindable var nav = Navigator.shared
        NavigationStack(path: stack) {
            SheetPager(page: $nav.sheetPage) {
                List {
                    // The first flight's card at the page's top, the first
                    // time with no route, as on FPL's (FirstFlightSection).
                    FirstFlightSection()
                    BrowseSections(nearest: search.nearest, pick: browse)
                }
                .accessibilityIdentifier("sheet-page-search")
            } fpl: {
                PlanView(open: openScreen, addStop: { search.presented = true })
                    .accessibilityIdentifier("sheet-page-fpl")
            }
            .oneSearch(search, host: host, oneRow: !split)
            // FPL's first row is the route's own, so the search's row (the
            // bar) is put away there on the iPhone; the one search stays on
            // the Search page alone (rule 5: one search field). The iPad's
            // sidebar has the height for both.
            .toolbar(nav.sheetPage == .fpl && !split && !search.presented ? .hidden : .visible, for: .navigationBar)
            .navigationTitle(nav.sheetPage == .fpl ? Screen.fpl.title : PlanPage.search.title)
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: search.nearest) }
        }
        // The dots under the grabber, centred, on both pages and at every
        // size, the pill too. The control is its row's height and no more,
        // so its taps never reach the system's grabber above it or the bar
        // below; it takes the row's whole width instead, where nothing
        // else is, and a tap either side of the dots turns the page as the
        // stock control's does.
        .safeAreaInset(edge: .top, spacing: 0) {
            PageDots(page: $nav.sheetPage)
                .frame(maxWidth: .infinity)
                .frame(height: PageDots.row)
        }
        // The search up (a tap on "Add a Stop", ⌘F, the microphone, a
        // link) is on the Search page, the one field's home.
        .onChange(of: search.presented) { _, up in if up { nav.sheetPage = .search } }
        // Search left (a swipe, the dots, a route shown): the search put
        // away and the keyboard with it, what was typed kept for the way
        // back (the web's sheet audit, 2026-11-12).
        .onChange(of: nav.sheetPage) { _, page in if page != .search, search.presented { search.presented = false } }
        // A route made (Fly Here, a link, a saved flight, typed): the FPL
        // page; a route cleared leaves the page where it is.
        .onChange(of: plan.routed, initial: true) { _, routed in if routed { nav.sheetPage = .fpl } }
        .environment(\.showPlan, { showPlan() })
        // The route's figures at the sheet's foot with a route, on the FPL
        // page at every size (the web's FlightLine), in the system's bar
        // (safeAreaBar, glassFoot); over the map on the iPad. Not at the
        // pill, where it covered the route's row (sheetAtPill).
        .glassFoot {
            if plan.routed, !split, !atPill, nav.sheetPage == .fpl {
                FiguresStrip()
                    .padding(.vertical, WingtipSpace.sm)
                    .frame(maxWidth: .infinity)
            }
        }
        // The card over the plan and the alerts, on the iPhone; the
        // iPad's inspector holds the card (SplitLayout).
        .modifier(PlanCards(on: !split, search: search))
    }

    /// The plan in sight: the search put away, the card closed and the
    /// sidebar back to its root.
    func showPlan() {
        search.close()
        Navigator.shared.showPlan()
    }

    /// The plan's stack as its rows push on it: a card on the iPhone (the
    /// plan has no page pushed on it), on the iPad a page on the sidebar's
    /// stack and a thing in the inspector.
    private var stack: Binding<[SheetPage]> {
        Binding(
            get: { Navigator.shared.planPath },
            set: { next in
                let nav = Navigator.shared
                if next.count > nav.planPath.count, let last = next.last, !(split && !last.inspects) {
                    nav.open(last)
                } else {
                    nav.planPath = next
                }
            })
    }

    /// A row of the plan's sections before a route (BrowseSections): a
    /// field's card or a list of fields, or an airplane's profile, as the
    /// search opens them.
    private func browse(_ picked: SearchPick) {
        switch picked {
        case .airport(let route): host.card(route)
        case .airplane(let tail): Navigator.shared.open(.tail(ProfileAsk(tail: tail.uppercased())))
        case .plan: showPlan()
        case .directTo, .types, .action: break
        }
    }

    private var host: SearchHost {
        SearchHost(
            card: { Navigator.shared.open(.airport($0)) },
            showPlan: { showPlan() },
            page: { page in if case .screen(let screen) = page { openScreen(screen) } else { Navigator.shared.open(page) } },
            screen: { openScreen($0) },
            field: { word(for: $0) },
            ask: { ask($0) })
    }
}

/// The card host on the iPhone's plan sheet; nothing on the iPad's sidebar.
private struct PlanCards: ViewModifier {
    let on: Bool
    let search: OneSearchModel

    func body(content: Content) -> some View {
        if on { content.cardHost(search: search) } else { content }
    }
}
