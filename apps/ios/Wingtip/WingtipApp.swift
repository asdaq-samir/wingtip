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
                .environment(session)
                .environment(charts)
                .environment(plan)
                .environment(ownShip)
                .environment(dryRun)
                .environment(traffic)
                .environment(verdict)
                .task { ownShip.start() }
                .task { await session.refresh() }
                .task { await charts.load() }
                .task { OfflineDownloads.shared.start() }
                .task { plan.restore() }
                // The flight in progress on the Lock Screen and in the
                // Dynamic Island (FlightActivity, a Live Activity: the
                // owner's ask, 2026-11-03, as Apple recommends for anything
                // ongoing), watched every few seconds: the dry run's, or
                // own ship's with a route planned.
                .task { await Ticker.shared.run(every: 5) { FlightActivity.shared.observe(plan: plan, dryRun: dryRun, ownShip: ownShip) } }
                // The next flight on the Home Screen and the Lock Screen
                // (WidgetFeed, FlightWidget in WingtipWidgets): the plan, its
                // verdict and the departure's weather, written to the App
                // Group only as they change, on the same clock; and the
                // fields the weather widget's settings offer first.
                .task {
                    await Ticker.shared.run(every: 15) {
                        WidgetFeed.shared.update(plan: plan, verdict: verdict)
                        WidgetFeed.shared.airports(homeBase: session.pilot?.homeBase, favorites: AirportShelf.shared.favorites)
                    }
                }
                // The route's weather watched after the Brief (WeatherWatch):
                // a look every quarter hour while the app runs, and iOS's
                // background refresh asked for as it goes behind.
                .task { await Ticker.shared.run(every: 60) { WeatherWatch.shared.tick(plan: plan) } }
                .onChange(of: scenePhase) { _, phase in if phase == .background { WeatherWatch.schedule() } }
                .task { await WatchLink.shared.run(plan: plan, ownShip: ownShip) }
                // The cockpit's ADS-B receiver on the Wi-Fi, read once a
                // second while the setting is Auto (Receiver).
                .task { await Receiver.shared.run() }
                // A link opens the app (Associated Domains): a route, a
                // field or an airplane shared from the site, or a track
                // file from Files or Mail, is a command RootView does
                // (Links); the sign-in link from Mail has its token handed
                // to the gateway here, and the pilot is signed in without
                // a browser.
                .onOpenURL { url in
                    if let command = Links.command(for: url) {
                        // A screen named beside a route opens once it is in.
                        switch command {
                        case .open, .sharedFlight: break
                        default: PendingCommand.shared.then = Links.screen(for: url)
                        }
                        PendingCommand.shared.command = command
                    } else {
                        Task { await session.open(url) }
                    }
                }
        }
        .backgroundTask(.appRefresh(WeatherWatch.taskId)) {
            await WeatherWatch.shared.look()
            await WeatherWatch.schedule()
        }
    }
}
