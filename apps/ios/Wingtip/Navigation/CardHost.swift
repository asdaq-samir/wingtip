import SwiftUI

extension View {
    /// The card over this sheet (Navigator's), and the app's alerts
    /// presented from whichever is on top: the card while one is up, else
    /// this sheet. One view presents one sheet
    /// at a time, and a view under a sheet it presents can present nothing
    /// (UIKit's one presenter), so every card goes through the one item
    /// here and every alert is hung on the top of the stack, never on the
    /// map under the plan's sheet, where it would never show.
    func cardHost(search: OneSearchModel) -> some View {
        modifier(CardHost(search: search))
    }
}

/// The card over the plan's sheet on the iPhone, as Maps opens a place
/// over its search: the system sheet, half way for every card but the
/// emergency assistant's (full), the map and its buttons live above it at
/// half height, its close at the right.
private struct CardHost: ViewModifier {
    @Environment(SheetEdge.self) private var sheetEdge
    @Environment(Navigator.self) private var nav
    let search: OneSearchModel

    func body(content: Content) -> some View {
        @Bindable var nav = self.nav
        content
            .sheet(item: $nav.presented) { card in
                CardStack(card: card, search: search)
                    .presentationDetents(card.page.detents, selection: $nav.cardDetent)
                    // A swipe down closes a settings card from half (You,
                    // Settings, the Map card), and only brings a content
                    // card down to its pill: a drag past the pill leaves it
                    // there, as the web's sheet refuses it (the flicker
                    // audit's FL-3, the owner's card rule 10), so a content
                    // card closes by its ✕, and Emergency by its ✕ alone.
                    .interactiveDismissDisabled(!card.page.swipeCloses)
                    // The map usable above a card up to half height; a
                    // question or a form stays modal (the scrolling rule).
                    .presentationBackgroundInteraction(card.page.modal ? .disabled : .enabled(upThrough: .half))
                    .environment(\.cardExpanded, nav.cardDetent == .large)
                    .environment(\.cardAtPill, nav.cardDetent == RootView.pill)
                    // The map's buttons ride the card's top while it is up,
                    // as they ride the plan's (MapButtonsDock).
                    .onGeometryChange(for: CGFloat.self) { $0.size.height + $0.safeAreaInsets.bottom } action: { sheetEdge.card = $0 }
                    .onDisappear { sheetEdge.card = nil }
                    .modifier(TopHosts(active: true))
            }
            .modifier(TopHosts(active: nav.card == nil))
    }
}

/// A card: its root page under its close, and what it opens pushed on its
/// own stack with Back (the owner's card rule, 2026-11-10). The iPhone's
/// sheet and the iPad's inspector both draw this.
struct CardStack: View {
    @Environment(Navigator.self) private var nav
    let card: Navigator.Card
    let search: OneSearchModel

    var body: some View {
        @Bindable var nav = self.nav
        NavigationStack(path: $nav.cardPath) {
            SheetPageView(page: card.page, nearest: search.nearest)
                .toolbar {
                    // An edit form's Cancel or a question's Not Now stands
                    // where the close would (HIG Sheets).
                    if !card.page.ownClose {
                        ToolbarItem(placement: .topBarTrailing) { CloseButton { nav.close() } }
                    }
                }
                .navigationDestination(for: SheetPage.self) { page in SheetPageView(page: page, nearest: search.nearest) }
        }
        // A card's action that sets the route (Fly Here, Fly This
        // Airplane): the card put away and the plan shown.
        .environment(\.showPlan, {
            search.close()
            nav.showPlan()
        })
    }
}

extension SheetPage {
    /// A question or an edit form: the map behind it is not live.
    var modal: Bool { ownClose }
}

/// The alerts that ask, hung on the top of the stack (CardHost): the
/// plan's sheet with no card up, else the card.
struct TopHosts: ViewModifier {
    let active: Bool

    func body(content: Content) -> some View {
        content
            // What the app is, once at first launch (PlanningAidNotice).
            .modifier(PlanningAidAlert(active: active))
            // A figure asked for a point of the route (FlightUI).
            .modifier(PointAlerts(active: active))
            // The airplanes' figures kept on this device, offered to the
            // account at sign-in (AirplaneHost).
            .modifier(AirplaneFigureAlerts(active: active))
            // Ready to Fly over a dry run's or a flight's start: one stock
            // prompt, its section in the Brief (ReadyToFlyPrompt).
            .modifier(ReadyToFlyPrompt(active: active))
    }
}

/// The cards a model opens by itself: a flight another pilot sent, the
/// flight just ended to log, the clearance asked for from the radio, and
/// the emergency assistant, from the instruments bar, the pilot's words,
/// You, the checklists or a link (no map button, decision 0010), a card
/// like every other since 2026-11-13 where it was a full-screen cover
/// (the owner: "For phones, just do it natively, but stay consistent").
/// Each opens as the one card when
/// its model asks and closes when its model is done; put away by the
/// pilot, Navigator tells the model (Navigator.left).
struct CardTriggers: ViewModifier {
    @Environment(SharedFlightModel.self) private var sharedFlight
    @Environment(AutoLogbook.self) private var logbook
    @Environment(ClearanceListener.self) private var listener
    @Environment(Emergency.self) private var emergency
    @Environment(Navigator.self) private var nav

    func body(content: Content) -> some View {
        content
            .onChange(of: sharedFlight.showing, initial: true) { _, up in follow(.sharedFlight, up) }
            .onChange(of: logbook.isOpen, initial: true) { _, up in follow(.flightLogged, up) }
            .onChange(of: listener.sheetShown, initial: true) { _, up in follow(.clearance, up) }
            .onChange(of: emergency.open != nil, initial: true) { _, up in follow(.emergency, up) }
    }

    /// The card up while its model asks, put away once it is done.
    private func follow(_ page: SheetPage, _ up: Bool) {
        if up {
            if nav.card?.page != page { nav.open(page) }
        } else if nav.card?.page == page {
            nav.close()
        }
    }
}
