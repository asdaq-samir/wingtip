import Observation

/// The flight on this phone, held in one place: the plan, own ship with
/// the path it flew and the flight recorder's track, the dry run, the
/// traffic near it, the verdict, the in-flight figures, the airplane
/// tracked, the IFR alternate checked, the alerts said aloud, the route's
/// weather watched after the Brief and the watch's link. Each was a model
/// of its own made by the app, or a singleton, so the root view, its loops
/// and the route's models each held a piece of the flight; now
/// ScreenModels makes this once, they read it, and the sign-out and the
/// navigator reach the same one. The views still find the part they draw
/// by its type in the environment (AppModels), so each is drawn again
/// only as what it read changes, as SwiftUI's Observation has it.
@MainActor
@Observable
final class FlightSession {
    let plan = Plan()
    let ownShip = OwnShip()
    let dryRun = DryRun()
    let traffic: Traffic
    let verdict = Verdict()
    let inFlight = InFlight()
    /// The alerts ahead said aloud, and a watch going off said with them.
    let spoken: SpokenAlerts
    let tracking: Tracking
    let alternate = AlternateCheck()
    let weatherWatch = WeatherWatch()
    let watchLink = WatchLink()
    /// The cockpit's ADS-B receiver (Receiver): its GPS, traffic and FIS-B.
    let receiver: Receiver

    init(receiver: Receiver = .shared) {
        self.receiver = receiver
        traffic = Traffic(receiver: receiver)
        let spoken = SpokenAlerts()
        self.spoken = spoken
        tracking = Tracking(spoken: spoken)
        // The cockpit receiver's GPS weighed against the device's for own
        // ship after each read (OwnShipSource).
        receiver.onOwnship = { [weak ownShip] own, state in ownShip?.fromReceiver(own, state) }
    }
}
