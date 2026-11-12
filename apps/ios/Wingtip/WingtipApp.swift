import AppIntents
import SwiftUI

/// Wingtip Maps, native: the FAA chart that works like Apple Maps, and
/// the route, checkpoints and nav log for a flight, on the same planner
/// and gateway as the website (docs/NATIVE.md). The web app stays the
/// product until this one passes the plan's gates.
@main
struct WingtipApp: App {
    @State private var session = Session()
    @State private var charts = Charts()
    @State private var plan = Plan()
    @State private var ownShip = OwnShip()
    @State private var dryRun = DryRun()
    @State private var traffic = Traffic()
    @State private var verdict = Verdict()
    /// Where every card and page opens (Navigator): one for the app, the
    /// views given it in the environment.
    @State private var nav = Navigator()
    @State private var inFlight = InFlight()
    @Environment(\.scenePhase) private var scenePhase
    /// iOS's hand-over of the chart downloads finished in the background.
    @UIApplicationDelegateAdaptor(OfflineAppDelegate.self) private var offlineDelegate

    init() {
        // Apple's own measurements of this app on this phone -- launch,
        // hangs, battery, crashes -- subscribed to from the first moment
        // (Metrics), so the figures the owner steers speed by come from
        // real flights rather than a simulator.
        Metrics.shared.start()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                // Every list's section titles the system's prominent ones,
                // 20 points in the text colour (the owner's "section titles
                // 20 pt", docs/decisions/0021), drawn by the system rather
                // than a hand-built title (the owner, 2026-11-10).
                .headerProminence(.increased)
                // An emailed sign-in link asks before it signs anyone in.
                .modifier(LinkSignInPrompt(session: session))
                .modifier(AppModels(session: session, charts: charts, plan: plan, ownShip: ownShip, dryRun: dryRun,
                                    traffic: traffic, verdict: verdict, nav: nav, inFlight: inFlight))
                .task { ownShip.start() }
                .task { await session.refresh() }
                // The deletes an earlier launch held behind their Undo and
                // never sent, sent once the pilot is signed in (PendingDeletes).
                .task(id: session.signedIn) {
                    if session.signedIn { await PendingDeletes().sendLeftOver(PendingDeletes.gateway) }
                }
                .task { await charts.load() }
                .task { OfflineDownloads.shared.start() }
                .task { await plan.restore() }
                // Under IFR, the alternate checked for the plan's ETA, asked
                // again as the plan or the alternate filed changes (AlternateCheck).
                .task(id: AlternateCheck.key(for: plan)) { await AlternateCheck.shared.refresh(plan: plan) }
                // The flight in progress on the Lock Screen and in the
                // Dynamic Island (FlightActivity, a Live Activity: the
                // owner's ask, 2026-11-03, as Apple recommends for anything
                // ongoing), watched every few seconds: the dry run's, or
                // own ship's with a route planned.
                .task { await Repeating.every(5) { FlightActivity.shared.observe(plan: plan, dryRun: dryRun, ownShip: ownShip, inFlight: inFlight) } }
                // The next flight on the Home Screen and the Lock Screen
                // (WidgetFeed, FlightWidget in WingtipWidgets): the plan, its
                // verdict and the departure's weather, written to the App
                // Group only as they change, on the same clock; and the
                // fields the weather widget's settings offer first.
                .task {
                    await Repeating.every(15) {
                        WidgetFeed.shared.update(plan: plan, verdict: verdict)
                        WidgetFeed.shared.airports(homeBase: session.pilot?.homeBase, favorites: AirportShelf.shared.favorites)
                    }
                }
                // The route's weather watched after the Brief (WeatherWatch):
                // a look every quarter hour while the app runs, and iOS's
                // background refresh asked for as it goes behind.
                .task { await Repeating.every(60) { WeatherWatch.shared.tick(plan: plan) } }
                .onChange(of: scenePhase) { _, phase in if phase == .background { WeatherWatch.schedule() } }
                .task { await WatchLink.shared.run(plan: plan, ownShip: ownShip) }
                // The cockpit's ADS-B receiver on the Wi-Fi, read once a
                // second while the setting is Auto (Receiver).
                .task { await Receiver.shared.run() }
        }
        .backgroundTask(.appRefresh(WeatherWatch.taskId)) {
            await WeatherWatch.shared.look()
            await WeatherWatch.schedule()
        }
    }
}
