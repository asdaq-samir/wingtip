import Foundation

/// The demo flight About offers: Madison to Oshkosh in a Cessna 172, a
/// short leg over Wisconsin between two towered fields, so a pilot (or
/// App Review) trying the app sees a whole plan in one tap. The same
/// flight as the web's (apps/web/src/lib/demoFlight.ts) and Android's
/// (about/DemoFlight.kt), so all three show the same thing.
///
/// The airplane is the planner's stock Cessna 172 profile
/// (data/aircraft/c172.json, "c172"), named here: the pilot asked for this
/// flight by name, so it is their pick, not an airplane assumed
/// (docs/decisions/0011).
enum DemoFlight {
    static let departure = "KMSN"
    static let destination = "KOSH"
    static let stops: [String] = []
    static let airplane = "c172"

    /// The flight put on the plan: the airplane set, the pilot's own
    /// altitude, procedures and edits of the last route let go, and the
    /// route given back for the root view to plan as a shared link's is,
    /// which brings the FPL tab up over the map (RootView's apply).
    @MainActor
    static func fly(_ plan: Plan) -> AppCommand {
        plan.flyType(airplane)
        plan.ownAltitudeFt = nil
        plan.ownAltitudeLegal = false
        plan.altitudeChoice = nil
        plan.procedures = []
        plan.extras = RouteExtras()
        return .planRoute(dep: departure, stops: stops, dest: destination)
    }
}
