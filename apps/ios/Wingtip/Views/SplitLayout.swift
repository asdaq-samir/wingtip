import SwiftUI

/// How the root lays itself out: on an iPhone (a Max held sideways too,
/// though it is then of the regular width) and on an iPad in a narrow
/// Split View, the map under the system sheet with its detents, the
/// owner's Apple Maps model; on an iPad of the regular width, as Maps lays
/// out on the iPad, the map across the screen with the plan and the one
/// search in the sidebar at its left, a field's card, the profile and the
/// brief in the inspector at its right, and the figures along its foot.
enum RootLayout: Equatable {
    case sheet
    case split

    /// By the size classes alone, as Apple asks of apps on iPhone Duo
    /// (its "Prepare your app for iPhone Duo" talk): regular both ways is
    /// an iPad or iPhone Duo open, with room for the map beside the
    /// sidebar. An iPhone Max held sideways is regular across but compact
    /// up and down, and keeps the sheet, as do iPhone Duo closed and an
    /// iPad in a narrow Split View.
    static func of(_ horizontal: UserInterfaceSizeClass?, _ vertical: UserInterfaceSizeClass?) -> RootLayout {
        horizontal == .regular && vertical == .regular ? .split : .sheet
    }

    /// Which of the fields' pages open in the inspector on iPad: a field's
    /// card and the airspace over a point, as Maps opens a place beside
    /// the map. The lists stay in the sidebar, where they were opened.
    static func inspects(_ route: AirportRoute) -> Bool {
        switch route {
        case .airport, .airspace: true
        case .list, .nearFrom: false
        }
    }
}

/// A second-level card, which the iPad shows in the inspector beside the
/// map rather than over the plan: a field's or a point's (as AirportRoute
/// writes it), the profile, the brief, or the flight's own cards
/// (FlightUI's: an airplane, a hold, a flown track and its replay).
enum SideCard: Hashable {
    case airport(String)
    case profile
    case brief
    case flight
    /// The pilot's saved flights (the plan's Flights button).
    case flights
}

extension EnvironmentValues {
    /// Set in the iPad's layout: the flight's cards go to the inspector.
    @Entry var splitLayout = false
    /// Opens a card in the inspector; nil on the iPhone, where it is
    /// pushed on the sheet's stack.
    var openCard: (@MainActor (SideCard) -> Void)? {
        get { self[OpenCardKey.self] }
        set { self[OpenCardKey.self] = newValue }
    }
    /// Closes the inspector's card; nil on the iPhone.
    var closeCard: (@MainActor () -> Void)? {
        get { self[CloseCardKey.self] }
        set { self[CloseCardKey.self] = newValue }
    }
}

// Keys of their own rather than @Entry, whose macro warns of any closure
// it stores (one cannot be compared, so a new one invalidates its
// readers): the iPad's layout sets these, read by a link and a close
// button, as OneField's openStripScreen is, and they behave as before.
private struct OpenCardKey: EnvironmentKey {
    static let defaultValue: (@MainActor (SideCard) -> Void)? = nil
}

private struct CloseCardKey: EnvironmentKey {
    static let defaultValue: (@MainActor () -> Void)? = nil
}

/// The iPad's layout: stock SwiftUI throughout. The plan under the one
/// search in the NavigationSplitView's sidebar (on iPadOS 26 and later a
/// floating glass card over the map), the map as its detail across the
/// screen, the second-level card in the system inspector, and the
/// flight's figures along the foot of the map.
struct SplitLayout<Map: View>: View {
    let map: Map
    /// The sheet's stack, the sidebar's here: a field or a point pushed on
    /// it opens in the inspector instead (RootLayout.inspects).
    @Binding var path: [SheetPage]
    let search: OneSearchModel
    @Binding var card: SideCard?
    let openScreen: (Screen) -> Void
    let ask: (String?) -> Void
    @State private var columns: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columns) {
            PlanSheet(path: sidebarPath, card: .constant(nil), search: search, openScreen: openScreen, ask: ask)
                .navigationSplitViewColumnWidth(min: 320, ideal: 375, max: 420)
        } detail: {
            map
                // The chart runs on under the floating sidebar (iPadOS 26).
                .chartUnderSidebar()
                .overlay(alignment: .bottom) {
                    FiguresStrip()
                        .environment(\.figuresOnGlass, true)
                        .padding(.vertical, WingtipSpace.md)
                        .frame(maxWidth: 520)
                        .floatingGlass(in: floatingCard)
                        .padding(.bottom, WingtipSpace.lg)
                        .padding(.horizontal, WingtipSpace.lg)
                }
                .toolbar(.hidden, for: .navigationBar)
                .inspector(isPresented: inspectorShown) {
                    inspector
                        .inspectorColumnWidth(min: 320, ideal: 375, max: 440)
                }
        }
        .navigationSplitViewStyle(.balanced)
        .environment(\.splitLayout, true)
        .environment(\.openCard, { card = $0 })
        .environment(\.closeCard, { close() })
        // A card's action done in the inspector (Fly Here, Fly This
        // Airplane): the card put away and the plan in the sidebar shown.
        .environment(\.showPlan, {
            search.close()
            path = []
            close()
        })
        // A flight's card (an airplane tapped, a hold, a flown track) opens
        // here; put away from inside, the inspector closes with it.
        .onChange(of: FlightUI.shared.card) { _, next in
            if next != nil {
                card = .flight
            } else if card == .flight {
                card = nil
                Tracking.shared.track(nil)
            }
        }
    }

    /// The sheet's stack, as the sidebar sees it: a field or a point
    /// pushed there opens in the inspector instead.
    private var sidebarPath: Binding<[SheetPage]> {
        Binding(
            get: { path },
            set: { next in
                if next.count > path.count, let last = next.last?.airportRoute, RootLayout.inspects(AirportRoute(last)) {
                    card = .airport(last)
                } else {
                    path = next
                }
            })
    }

    private var inspectorShown: Binding<Bool> {
        Binding(get: { card != nil }, set: { shown in if !shown { close() } })
    }

    private func close() {
        if card == .flight {
            FlightUI.shared.card = nil
            Tracking.shared.track(nil)
        }
        card = nil
    }

    @ViewBuilder private var inspector: some View {
        switch card {
        case .airport(let text):
            NavigationStack {
                AirportDestination(route: AirportRoute(text), nearest: []).toolbar { closeItem }
                    // The card's own links (its NOTAMs, Ready to Fly's Brief)
                    // push in the inspector, as they do in the iPhone's sheet.
                    .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: []) }
            }
            .id(text)
        case .profile:
            NavigationStack { ProfileCard().toolbar { closeItem } }
        case .brief:
            NavigationStack {
                BriefView().toolbar { closeItem }
                    .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: []) }
            }
        case .flights:
            NavigationStack { FlightsView().toolbar { closeItem } }
        case .flight:
            // Each has its own stack and close (FlightSheets' cards).
            switch FlightUI.shared.card {
            case .airplane(let hex): AirplaneCard(hex: hex).id(hex)
            case .hold(let fix): HoldSheet(fix: fix).id(fix)
            case .flown(let id, let title): FlownTrackView(flight: id, title: title).id(id)
            case .leg(let index): RouteLegSheet(index: index).id(index)
            case nil: EmptyView()
            }
        case nil:
            EmptyView()
        }
    }

    private var closeItem: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            CloseButton { close() }
        }
    }
}

#Preview("SplitLayout") {
    @Previewable @State var path: [SheetPage] = []
    @Previewable @State var card: SideCard? = nil
    SplitLayout(map: Color(.secondarySystemBackground).ignoresSafeArea(), path: $path, search: OneSearchModel(), card: $card,
                openScreen: { _ in }, ask: { _ in })
        .environment(Session())
        .environment(Charts())
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
        .environment(Traffic())
        .environment(Verdict())
}

private extension View {
    /// The map mirrored on under the sidebar's glass, as Maps' does on
    /// iPadOS 26 (backgroundExtensionEffect); as it was before.
    @ViewBuilder
    func chartUnderSidebar() -> some View {
        if #available(iOS 26.0, *) { backgroundExtensionEffect() } else { self }
    }
}
