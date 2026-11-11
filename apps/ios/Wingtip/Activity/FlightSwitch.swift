#if canImport(ActivityKit)
import Foundation

/// The control's work in the app (FlightControlIntent): the flight's Live
/// Activity started by the pilot from the route kept on the phone, or
/// ended. The widget extension has its own FlightSwitch that does nothing,
/// since iOS runs the intent here.
enum FlightSwitch {
    /// Nil once done; else why not, in the pilot's words.
    @MainActor
    static func set(_ on: Bool, activity: FlightActivity = .shared) async -> String? {
        if on {
            guard activity.startByPilot() else { return activity.problem ?? "The flight could not be started." }
            // Started: Ready to fly shown once where something is missing.
            await ReadyToFly.shared.flightStarted()
            return nil
        }
        activity.stopByPilot()
        return nil
    }
}
#endif
