import AppIntents
import SwiftUI
import TipKit

/// Wingtip Maps, native: the FAA chart that works like Apple Maps, and
/// the route, checkpoints and nav log for a flight, on the same planner
/// and gateway as the website (docs/NATIVE.md). The web app stays the
/// product until this one passes the plan's gates.
@main
struct WingtipApp: App {
    @State private var session: Session
    @State private var charts = Charts()
    /// The screens' own models (ScreenModels), one each for the app, the
    /// flight (FlightSession) among them.
    @State private var screens: ScreenModels
    /// iOS's hand-over of the chart downloads finished in the background.
    @UIApplicationDelegateAdaptor(OfflineAppDelegate.self) private var offlineDelegate

    init() {
        // Apple's own measurements of this app on this phone -- launch,
        // hangs, battery, crashes -- subscribed to from the first moment
        // (Metrics), so the figures the owner steers speed by come from
        // real flights rather than a simulator.
        Metrics.shared.start()
        let screens = ScreenModels()
        _screens = State(initialValue: screens)
        // The intents' share of them, by App Intents' own dependencies.
        AppDependencyManager.shared.add(dependency: screens.briefAsk)
        AppDependencyManager.shared.add(dependency: screens.autoLogbook)
        // Signing out forgets the flight's own records too (Session.signOut).
        let session = Session()
        session.flight = screens.flight
        _session = State(initialValue: session)
        // TipKit's one tip, the FPL toggle's after the first route
        // (FplTip); none under the UI tests' and pictures' launch
        // arguments, where it would cover what they look at.
        if CommandLine.arguments.contains(where: { ["-screen", "-layout", "-fresh", "-card"].contains($0) }) {
            Tips.hideAllTipsForTesting()
        }
        try? Tips.configure()
    }

    var body: some Scene {
        let flight = screens.flight
        // The app's window, and on an iPad as many as the pilot opens (File
        // > New Window, Stage Manager, an external display), each its own
        // map and cards over the one flight (MainWindow).
        WindowGroup {
            MainWindow(session: session, charts: charts, screens: screens)
        }
        .commands { WingtipCommands() }
        .backgroundTask(.appRefresh(WeatherWatch.taskId)) { [watch = flight.weatherWatch] in
            await watch.look()
            await WeatherWatch.schedule()
        }
        // A chart in a window of its own beside the map (PictureWindow),
        // opened from the plate viewer or a chart's row on an iPad. Links,
        // files and Siri go to the app's own window, never to a chart's.
        WindowGroup("Chart", id: PictureRequest.window, for: PictureRequest.self) { $request in
            if let request {
                PictureWindow(request: request)
                    .modifier(AppModels(session: session, charts: charts, nav: Navigator(), screens: screens))
            }
        }
        .handlesExternalEvents(matching: [])
        // A document of the library, or the pilot's own, in a window of its
        // own beside the map (DocumentWindow), as a chart's is; its links
        // go to the app's own window too.
        WindowGroup("Document", id: DocPlace.window, for: DocPlace.self) { $place in
            if let place {
                DocumentWindow(place: place)
                    .modifier(AppModels(session: session, charts: charts, nav: Navigator(), screens: screens))
            }
        }
        .handlesExternalEvents(matching: [])
    }
}
