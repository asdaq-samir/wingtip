import SwiftUI

/// The app's models, handed down the views in the environment (SwiftUI's
/// Observation): each screen reads the one it draws and is drawn again
/// only as what it read changes. The app's root gives them (WingtipApp),
/// and so does anything hosting a view outside it (the map mark's card
/// preview, AirportMarkMenu), so every card finds the same ones.
struct AppModels: ViewModifier {
    let session: Session
    let charts: Charts
    let nav: Navigator
    let screens: ScreenModels

    func body(content: Content) -> some View {
        let flight = screens.flight
        content
            .environment(session)
            .environment(charts)
            .environment(nav)
            .environment(screens)
            // The flight (FlightSession) whole, for the root and its loops,
            // and each of its parts by its type, for the view that draws it.
            .environment(flight)
            .environment(flight.plan)
            .environment(flight.ownShip)
            .environment(flight.dryRun)
            .environment(flight.traffic)
            .environment(flight.verdict)
            .environment(flight.inFlight)
            .environment(flight.tracking)
            .environment(flight.alternate)
            .modifier(ReachedModels(screens: screens))
    }
}

/// The screens' own models (ScreenModels), and those the rest of the app
/// still reaches by their types -- the session, the intents, the Live
/// Activity and the widgets' feed -- until those take them too; the
/// screens read them all from the environment, given here.
private struct ReachedModels: ViewModifier {
    let screens: ScreenModels

    func body(content: Content) -> some View {
        content
            .environment(Feel.shared)
            .environment(screens.firstFlight)
            .environment(screens.sheetEdge)
            .environment(screens.flightUI)
            .environment(screens.replay)
            .environment(screens.figureOffer)
            .environment(screens.emergency)
            .environment(screens.copilot)
            .environment(screens.atcCopilot)
            .environment(screens.screenAsk)
            .environment(screens.briefAsk)
            .environment(screens.autoLogbook)
            .environment(screens.sharedFlight)
            .environment(ClearanceListener.shared)
            .environment(Receiver.shared)
            .environment(AirportShelf.shared)
            .environment(Airplanes.shared)
            .environment(ReadyToFly.shared)
            .environment(KeepForAir.shared)
            .environment(KeptShown.shared)
            .environment(VoiceInput.shared)
            .environment(ServerFeatures.shared)
            .environment(ModelWeather.shared)
            .environment(WeatherLoop.shared)
    }
}

extension RootView {
    /// The models this root was given, for a view hosted outside it.
    var models: AppModels {
        AppModels(session: session, charts: charts, nav: nav, screens: screens)
    }
}

/// The screens' own models the app makes once, given to the views in the
/// environment (AppModels) and to the intents and the app's loops as
/// arguments or App Intents' dependencies (WingtipApp), in place of a
/// singleton each; the flight (FlightSession) among them.
@MainActor
@Observable
final class ScreenModels {
    let flight: FlightSession
    let firstFlight = FirstFlightModel()
    let sheetEdge = SheetEdge()
    let flightUI = FlightUI()
    let replay = Replay()
    let figureOffer = FigureOffer()
    let emergency = Emergency()
    let copilot = Copilot()
    let atcCopilot = AtcCopilot()
    let screenAsk = ScreenAsk()
    let briefAsk = BriefAsk()
    let autoLogbook: AutoLogbook
    let sharedFlight = SharedFlightModel()

    init() {
        let flight = FlightSession()
        self.flight = flight
        // The flight logged from the flight's own recorder (OwnShip.recorder).
        autoLogbook = AutoLogbook(recorder: flight.ownShip.recorder)
    }
}
