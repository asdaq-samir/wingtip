import SwiftUI

/// The plan's sheet: two pages turned by the one round toggle on the map
/// (MapSideButtons; the owner, 2026-11-13), Search -- the one search with
/// the microphone and the avatar beside the field, over Favorites,
/// Recents, Find Nearby and Nearest -- and FPL, the plan. The first time
/// the app opens with no route, the welcome over it (WelcomeSheet).
/// Every card and page opened from either -- a field's card, the Brief,
/// the nav log, the airplane, Settings and its pages -- is one card over
/// both with its close (Navigator, CardHost), as Maps opens a place over
/// its search, and its close comes back to the page it was opened on. On
/// the iPad the same two pages in the sidebar, its pages pushed there and
/// its things in the inspector.
struct PlanSheet: View {
    @Environment(Navigator.self) var nav
    @Environment(Plan.self) var plan
    @Environment(ClearanceListener.self) var listener
    @Environment(AirportShelf.self) var shelf
    @Environment(\.splitLayout) private var split
    @Environment(\.sheetAtPill) private var atPill
    @Environment(FirstFlightModel.self) private var firstFlight
    @AppStorage(PlanningAidNotice.acceptedKey) private var planningAidAccepted = false
    let search: OneSearchModel
    /// A screen by its name, as a link opens it (RootView.openScreen): the
    /// one way a page opens by name.
    let openScreen: (Screen) -> Void
    /// Ask, with the question when there is one.
    let ask: (String?) -> Void

    var body: some View {
        NavigationStack(path: stack) {
            SheetPages(page: nav.sheetPage) {
                List {
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
        // The welcome, the first time with no route, once the planning
        // aid's words are accepted (the two never stack); put away, the
        // Search page asks for the destination (welcomeDone).
        .sheet(isPresented: Binding(
            get: { firstFlight.shown(routed: plan.routed) && (planningAidAccepted || !PlanningAidNotice.wanted()) && nav.card == nil },
            set: { up in if !up { welcomeDone() } })) {
                WelcomeSheet(go: welcomeDone)
                    .presentationDetents([.large])
        }
        // The search up (a tap on "Add a Stop", ⌘F, the microphone, a
        // link) is on the Search page, the one field's home.
        .onChange(of: search.presented) { _, up in if up { nav.sheetPage = .search } }
        // Search left (the toggle, a route shown): the search put
        // away and the keyboard with it, what was typed kept for the way
        // back (the web's sheet audit, 2026-11-12).
        .onChange(of: nav.sheetPage) { _, page in if page != .search, search.presented { search.presented = false } }
        // A route made (Fly Here, a link, a saved flight, typed): the FPL
        // page; a route cleared leaves the page where it is.
        .onChange(of: plan.routed, initial: true) { _, routed in
            if routed {
                nav.sheetPage = .fpl
                // The toggle's one tip, after the first route (FplTip).
                FplTip.routed = true
            }
        }
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

    /// The welcome put away (Let's Go Flying, Later, Turn On Location or a
    /// swipe): seen for good, and the Search page up asking for the
    /// destination, the field not focused so no keyboard jumps up; the
    /// sheet rises from the pill to half to show it (RootView).
    private func welcomeDone() {
        guard !firstFlight.seen else { return }
        firstFlight.dismiss()
        nav.sheetPage = .search
        search.askingDestination = true
    }

    /// The plan in sight: the search put away, the card closed and the
    /// sidebar back to its root.
    func showPlan() {
        search.close()
        nav.showPlan()
    }

    /// The plan's stack as its rows push on it: a card on the iPhone (the
    /// plan has no page pushed on it), on the iPad a page on the sidebar's
    /// stack and a thing in the inspector.
    private var stack: Binding<[SheetPage]> {
        Binding(
            get: { nav.planPath },
            set: { next in
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
        case .airplane(let tail): nav.open(.tail(ProfileAsk(tail: tail.uppercased())))
        case .plan: showPlan()
        case .directTo, .types, .action: break
        }
    }

    private var host: SearchHost {
        SearchHost(
            card: { nav.open(.airport($0)) },
            showPlan: { showPlan() },
            page: { page in if case .screen(let screen) = page { openScreen(screen) } else { nav.open(page) } },
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
