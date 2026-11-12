import AppIntents
import Observation
import SwiftUI

/// What Siri, a Shortcut, a link or a tap elsewhere in the app asks the
/// root view to do (RootView+Commands): plan a route, open a screen, fly
/// direct.
enum AppCommand: Equatable, Sendable {
    /// A route to the field, from the route's departure or the field
    /// nearest the airplane ("plan a trip to Las Vegas").
    case planTo(ident: String)
    /// The same route, then its Brief opened ("brief my flight to
    /// Oshkosh").
    case brief(ident: String)
    /// A whole route, as a shared link carries one.
    case planRoute(dep: String, stops: [String], dest: String)
    /// Direct to the place said, from where the airplane is.
    case directTo(place: String)
    /// The nearest airports, in the Airport tab.
    case nearest
    /// A field's card, for its weather.
    case weather(ident: String)
    /// An airplane tracked, by its ICAO address, from a shared link.
    case aircraft(hex: String)
    /// A track file (GPX, KML) opened in the app, flown again on the map.
    case track(URL)
    /// One of the app's screens by its name (design/screens.json), as a
    /// link's `open=` names it.
    case open(Screen)
    /// A flight another pilot sent, previewed before anything is
    /// planned (SharedFlightModel).
    case sharedFlight(SharedFlightLink)
    /// An airplane's profile, by its N-number, as a link's `?airplane=`
    /// opens it (design/screens.json).
    case airplane(tail: String)
    /// The route flown with an airplane, by its N-number (FlyAirplaneIntent).
    case fly(tail: String)
    /// An approach put on the route at its field and the Brief opened
    /// (BriefApproachIntent).
    case approach(ProcedurePick)
    /// The route kept for the air: charts, briefing, NOTAMs, cards
    /// (KeepForAirIntent, KeepForAir).
    case keepForAir
}

/// The root view's commands, handed down the views as SwiftUI hands down
/// its own actions (OpenURLAction): a figure, a row or a menu deep in a
/// card asks the root to do a command, with the screen to open after it
/// where one is named, and it is done at once.
struct AppCommandAction {
    let run: @MainActor (AppCommand, Screen?) -> Void

    @MainActor
    func callAsFunction(_ command: AppCommand, then: Screen? = nil) { run(command, then) }
}

extension EnvironmentValues {
    /// Set by RootView; nothing done outside it (a preview's card).
    @Entry var appCommand = AppCommandAction { _, _ in }
}

/// An intent that opens the app on a command (Siri, Shortcuts,
/// Spotlight, the Control Center controls). On iOS 26 and later the
/// system hands the intent to the scene itself (TargetContentProvidingIntent,
/// the root view's `onAppIntentExecution`, before `perform`), so the app
/// is on the screen to do it; `perform` then only says what it did.
protocol CommandIntent: AppIntent {
    /// What the app does for the intent, nil for nothing; read once, on
    /// the main actor, as the app is opened.
    @MainActor func appCommand() -> AppCommand?
}

extension CommandIntent {
    /// Before iOS 26 no scene is handed the intent, so `perform` leaves
    /// its command with the app for the root view to take once it is on
    /// the screen (AppCommands).
    func handOver(to commands: AppCommands) async {
        if #available(iOS 26, *) { return }
        await MainActor.run { commands.waiting = appCommand() }
    }
}

/// The command an intent left before iOS 26, which hands the scene no
/// intent: kept until the root view is on the screen to take it (an
/// intent runs before the scene it opens has drawn). One at a time; the
/// last asked wins, as the pilot's last word to Siri does. Given to the
/// intents by App Intents' own dependencies (AppDependencyManager,
/// WingtipApp). To go once the app's oldest iOS is 26.
@MainActor
@Observable
final class AppCommands {
    var waiting: AppCommand?

    /// The command, and none left: taken once by the root view.
    func take() -> AppCommand? {
        defer { waiting = nil }
        return waiting
    }
}
