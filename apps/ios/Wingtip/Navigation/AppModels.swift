import SwiftUI

/// The app's models, handed down the views in the environment (SwiftUI's
/// Observation): each screen reads the one it draws and is drawn again
/// only as what it read changes. The app's root gives them (WingtipApp),
/// and so does anything hosting a view outside it (the map mark's card
/// preview, AirportMarkMenu), so every card finds the same ones.
struct AppModels: ViewModifier {
    let session: Session
    let charts: Charts
    let plan: Plan
    let ownShip: OwnShip
    let dryRun: DryRun
    let traffic: Traffic
    let verdict: Verdict
    let nav: Navigator
    let inFlight: InFlight
    let screens: ScreenModels

    func body(content: Content) -> some View {
        content
            .environment(session)
            .environment(charts)
            .environment(plan)
            .environment(ownShip)
            .environment(dryRun)
            .environment(traffic)
            .environment(verdict)
            .environment(nav)
            .environment(inFlight)
            .environment(screens)
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
            .environment(Tracking.shared)
            .environment(ClearanceListener.shared)
            .environment(Receiver.shared)
            .environment(AirportShelf.shared)
            .environment(Airplanes.shared)
            .environment(ReadyToFly.shared)
            .environment(AlternateCheck.shared)
            .environment(KeepForAir.shared)
            .environment(KeptShown.shared)
            .environment(VoiceInput.shared)
            .environment(ModelWeather.shared)
            .environment(WeatherLoop.shared)
    }
}

extension RootView {
    /// The models this root was given, for a view hosted outside it.
    var models: AppModels {
        AppModels(session: session, charts: charts, plan: plan, ownShip: ownShip, dryRun: dryRun,
                  traffic: traffic, verdict: verdict, nav: nav, inFlight: inFlight, screens: screens)
    }
}

/// The screens' own models the app makes once, given to the views in the
/// environment (AppModels) and to the intents and the app's loops as
/// arguments or App Intents' dependencies (WingtipApp), in place of a
/// singleton each.
@MainActor
@Observable
final class ScreenModels {
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
    let autoLogbook = AutoLogbook()
    let sharedFlight = SharedFlightModel()
}
