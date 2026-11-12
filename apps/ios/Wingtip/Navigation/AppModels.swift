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
            .modifier(ReachedModels())
    }
}

/// The models the rest of the app reaches too -- the session, the
/// navigator, the intents, the Live Activity and the widgets' feed -- held
/// by their types until those take them as the screens do; the screens
/// read them from the environment, given here.
private struct ReachedModels: ViewModifier {
    func body(content: Content) -> some View {
        content
            .environment(Tracking.shared)
            .environment(ClearanceListener.shared)
            .environment(AtcCopilot.shared)
            .environment(Copilot.shared)
            .environment(Emergency.shared)
            .environment(Replay.shared)
            .environment(Receiver.shared)
            .environment(AirportShelf.shared)
            .environment(Airplanes.shared)
            .environment(FigureOffer.shared)
            .environment(ReadyToFly.shared)
            .environment(AlternateCheck.shared)
            .environment(KeepForAir.shared)
            .environment(KeptShown.shared)
            .environment(FirstFlightModel.shared)
            .environment(VoiceInput.shared)
            .environment(FlightUI.shared)
            .environment(Feel.shared)
            .environment(SheetEdge.shared)
            .environment(AutoLogbook.shared)
            .environment(SharedFlightModel.shared)
            .environment(BriefAsk.shared)
            .environment(ServerFeatures.shared)
            .environment(ModelWeather.shared)
            .environment(WeatherLoop.shared)
    }
}

extension RootView {
    /// The models this root was given, for a view hosted outside it.
    var models: AppModels {
        AppModels(session: session, charts: charts, plan: plan, ownShip: ownShip, dryRun: dryRun,
                  traffic: traffic, verdict: verdict, nav: nav, inFlight: inFlight)
    }
}
