import SwiftUI

/// The plan's sheet: the plan at its root under the one search, with the
/// microphone and the account button beside the field, and every card and
/// page opened from it -- a field's card, the Brief, the nav log, the
/// airplane, Settings and its pages -- one card over it with its close
/// (Navigator, CardHost), as Maps opens a place over its search. On the
/// iPad the same plan in the sidebar, its pages pushed there and its
/// things in the inspector.
struct PlanSheet: View {
    @Environment(Plan.self) var plan
    @Environment(\.splitLayout) private var split
    let search: OneSearchModel
    /// A screen by its name, as a link opens it (RootView.openScreen): the
    /// one way a page opens by name.
    let openScreen: (Screen) -> Void
    /// Ask, with the question when there is one.
    let ask: (String?) -> Void

    var body: some View {
        NavigationStack(path: stack) {
            PlanView(open: openScreen, addStop: { search.presented = true })
                .oneSearch(search, host: host)
                .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: search.nearest) }
        }
        .environment(\.showPlan, { showPlan() })
        // The route's figures at the sheet's foot with a route, on every
        // page and size (the web's FlightLine), in the system's bar
        // (safeAreaBar, glassFoot); over the map on the iPad.
        .glassFoot {
            if plan.routed, !split {
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
