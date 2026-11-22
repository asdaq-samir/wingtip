import SwiftUI

/// The app's own work while it runs, in the lead window alone
/// (MainWindow, WindowLead): own ship, the session, the charts, the
/// downloads, the plan brought back, the alternate checked, the Live
/// Activity, the widgets' feed, the weather watched, the unsent tracks,
/// the Watch and the cockpit's receiver. Each was a `.task` on the one
/// window's root until the iPad had windows; in every window, a second
/// would have read the receiver and fed the widgets twice over. A view
/// of no size behind the root, so its tasks live and end with the window.
struct AppLoops: View {
    let session: Session
    let charts: Charts
    let screens: ScreenModels
    @Environment(\.scenePhase) private var scenePhase
    /// The widgets' feed, and the pilot's kept fields it offers them.
    private let feed = WidgetFeed.shared
    private let shelf = AirportShelf.shared

    var body: some View {
        let flight = screens.flight
        let (plan, ownShip) = (flight.plan, flight.ownShip)
        Color.clear
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
            .task { if Self.first("ownShip") { ownShip.start() } }
            // Whether this iPhone transcribes English on itself (SpeechSession).
            .task { await SpeechSession.check() }
            .task { await session.refresh() }
            // The deletes an earlier launch held behind their Undo and
            // never sent, sent once the pilot is signed in (PendingDeletes).
            .task(id: session.signedIn) {
                if session.signedIn { await PendingDeletes().sendLeftOver(PendingDeletes.gateway) }
            }
            .task { await charts.load() }
            .task { await charts.watchChangeover() }
            .task { if Self.first("downloads") { OfflineDownloads.shared.start() } }
            // Once a launch: a window that takes the lead from one shut
            // later finds the plan the pilot has, not the one kept.
            .task { if Self.first("restore") { await plan.restore() } }
            // Under IFR, the alternate checked for the plan's ETA, asked
            // again as the plan or the alternate filed changes (AlternateCheck).
            .task(id: AlternateCheck.key(for: plan)) { await flight.alternate.refresh(plan: plan) }
            // The flight in progress on the Lock Screen and in the
            // Dynamic Island (FlightActivity, a Live Activity: the
            // owner's ask, 2026-11-03, as Apple recommends for anything
            // ongoing), watched every few seconds: the dry run's, or
            // own ship's with a route planned.
            .task { await Repeating.every(5) { FlightActivity.shared.observe(plan: plan, dryRun: flight.dryRun, ownShip: ownShip, inFlight: flight.inFlight,
                                                                             copilot: screens.copilot, atc: screens.atcCopilot,
                                                                             weather: flight.weatherWatch.latest) } }
            // The next flight on the Home Screen and the Lock Screen
            // (WidgetFeed, FlightWidget in WingtipWidgets): the plan, its
            // verdict and the departure's weather, written to the App
            // Group only as they change, on the same clock; and the
            // fields the weather widget's settings offer first, written
            // as the home base or the favourites change, not each 15 s.
            .task { await Repeating.every(15) { feed.update(plan: plan, verdict: flight.verdict) } }
            .onChange(of: [session.pilot?.homeBase ?? ""] + shelf.favorites.map(\.ident), initial: true) {
                feed.airports(homeBase: session.pilot?.homeBase, favorites: shelf.favorites)
            }
            // The route's weather watched after the Brief (WeatherWatch):
            // a look every quarter hour while the app runs, and iOS's
            // background refresh asked for as it goes behind.
            .task { await Repeating.every(60) { flight.weatherWatch.tick(plan: plan) } }
            .onChange(of: scenePhase) { _, phase in if phase == .background { Task { await WeatherWatch.schedule() } } }
            // A logged flight's track that could not be sent (no
            // signal after landing) sent again each time the app is
            // in front with a network (AutoLogbook, UnsentTracks).
            .task(id: scenePhase) { if scenePhase == .active { await screens.autoLogbook.sendUnsentWhenOnline() } }
            .task { await flight.watchLink.run(plan: plan, ownShip: ownShip) }
            // The cockpit's ADS-B receiver on the Wi-Fi, read once a
            // second while the setting is Auto (Receiver).
            .task { await Receiver.shared.run() }
    }

    /// The starts made once a launch, whichever window leads.
    @MainActor private static var started: Set<String> = []

    /// Whether this is the launch's first start of `what`, marking it made.
    @MainActor static func first(_ what: String) -> Bool {
        started.insert(what).inserted
    }
}
