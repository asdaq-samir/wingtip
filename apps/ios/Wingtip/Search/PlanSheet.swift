import SwiftUI

/// The sheet's one stack, the tabs' place (the owner's one-search design,
/// 2026-11-09): the plan at its root under the one search, with the
/// microphone and the account button beside the field, and every page
/// pushed over it -- a field's card, the Brief, the nav log, the
/// airplane, the account menu's pages -- each closing back one level. In
/// the iPhone's system sheet and the iPad's sidebar alike.
struct PlanSheet: View {
    @Environment(Plan.self) var plan
    @Environment(\.splitLayout) private var split
    /// The iPad's inspector, which holds the profile, the Brief and the
    /// flights beside the map; nil on the iPhone.
    @Environment(\.openCard) private var openCard
    @Environment(\.closeCard) private var closeCard
    @Binding var path: [SheetPage]
    /// A field's or a point's card, its own sheet over this one on the
    /// iPhone (half, then full), as Maps opens a place; the inspector
    /// holds it on the iPad.
    @Binding var card: PlaceCard?
    let search: OneSearchModel
    /// A screen by its name, as a link opens it (RootView.openScreen).
    let openScreen: (Screen) -> Void
    /// Ask, with the question when there is one.
    let ask: (String?) -> Void

    var body: some View {
        NavigationStack(path: stack) {
            PlanView(open: push, addStop: { search.presented = true })
                .oneSearch(search, host: host)
                .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: search.nearest) }
        }
        .sheet(item: $card) { shown in PlaceCardSheet(route: shown.route, nearest: search.nearest) }
        // A leg's detail grows out of its nav log row (CardZoom).
        .cardZoomStack()
        .environment(\.showPlan, { showPlan() })
        // The route's figures at the sheet's foot with a route, on every
        // page and size (the web's FlightLine); over the map on the iPad.
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if plan.routed, !split {
                FiguresStrip()
                    .padding(.vertical, WingtipSpace.sm)
                    .frame(maxWidth: .infinity)
                    .glassBackground()
            }
        }
        // An airplane's card, a point pressed on the map, a hold, a flown
        // track, over the plan.
        .modifier(FlightSheets())
    }

    /// A page of the plan's: the profile, the Brief and the flights in
    /// the iPad's inspector, as Maps opens a place beside the map; pushed
    /// here otherwise.
    func push(_ screen: Screen) {
        if let openCard, let card = SideCard(screen) {
            openCard(card)
            return
        }
        guard SheetPage.pushes(screen) else { openScreen(screen); return }
        path.append(.screen(screen))
    }

    /// The plan in sight: the search put away, the card closed and the
    /// stack back to its root; on the iPad, the inspector's card too.
    func showPlan() {
        search.close()
        card = nil
        path = []
        closeCard?()
    }

    /// The stack as its rows push on it: a field's card or a point's opens
    /// as its own sheet (the iPad's inspector), the lists are pages here.
    private var stack: Binding<[SheetPage]> {
        Binding(
            get: { path },
            set: { next in
                if next.count > path.count, let route = next.last?.airportRoute, RootLayout.inspects(AirportRoute(route)) {
                    openCardFor(route)
                } else {
                    path = next
                }
            })
    }

    /// A field's or a point's card, where this layout opens it.
    func openCardFor(_ route: String) {
        if RootLayout.inspects(AirportRoute(route)) {
            if let openCard { openCard(.airport(route)) } else { card = PlaceCard(route: route) }
        } else {
            path.append(.airport(route))
        }
    }

    private var host: SearchHost {
        SearchHost(
            card: { openCardFor($0) },
            showPlan: { showPlan() },
            page: { page in if case .screen(let screen) = page { push(screen) } else { path.append(page) } },
            screen: { push($0) },
            field: { word(for: $0) },
            ask: { ask($0) })
    }
}

/// A field's or a point's card up, by its route (AirportRoute's text).
struct PlaceCard: Identifiable, Hashable {
    let route: String
    var id: String { route }
}

/// A field's or a point's card as its own stock sheet, half way then full
/// (the owner, 2026-11-09: every card the iOS-native way): its large
/// title, its close, growing out of the row or mark it was opened from.
struct PlaceCardSheet: View {
    let route: String
    let nearest: [NearestAirport]
    @Environment(\.dismiss) private var dismiss
    /// Half way first; the picture at its head shows at full height alone.
    @State private var detent: PresentationDetent = .medium

    var body: some View {
        NavigationStack {
            AirportDestination(route: AirportRoute(route), nearest: nearest)
                .closeButton { dismiss() }
                .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: nearest) }
        }
        .environment(\.cardExpanded, detent == .large)
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        .zoomsFrom(route)
    }
}

extension SideCard {
    /// The inspector's card for a screen the iPad shows beside the map.
    init?(_ screen: Screen) {
        switch screen {
        case .brief: self = .brief
        case .profile: self = .profile
        case .flights: self = .flights
        default: return nil
        }
    }
}
