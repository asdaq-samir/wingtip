#if canImport(ActivityKit)
import ActivityKit
import Foundation

/// A flight in progress as the Lock Screen and the Dynamic Island show it
/// (ActivityKit's Live Activity, Apple's recommendation for anything
/// ongoing): the route, and what changes as it is flown. Compiled into
/// the app, which starts and updates the activity (FlightActivity), and
/// into the widget extension, which draws it (FlightActivityWidget): both
/// must see one and the same type. The figures are the engine's
/// `in_flight` answers (InFlight), carried as numbers and written on the
/// screen by Format, as every figure is (FlightActivityLines).
struct FlightActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable, Sendable {
        /// The next point of the route ahead and the minutes to it at the
        /// speed being made good; nil past the last one or before a fix.
        var nextFix: String?
        var nextEteMin: Double?
        /// The miles still to fly to the destination.
        var toGoNm: Double
        /// The minutes to the destination and the clock time of arrival
        /// they point at; nil where the engine has no speed to work them.
        var destEteMin: Double?
        var eta: Date?
        /// Gallons the plan expects left at this point (the planned burn
        /// counted down, never the airplane's gauge); nil with no airplane
        /// picked, since an assumed airplane's fuel is no figure at all
        /// (docs/decisions/0011).
        var fuelLeftGal: Double?
        /// The frequency ATC last handed us, as heard ("Chicago Approach
        /// 124.35"); nil where none has been heard.
        var frequency: String?
        /// The in-flight copilot's one message now, its banner line, and
        /// whether it is a warning rather than a note.
        var copilot: String?
        var copilotWarns: Bool = false
        var updatedAt: Date
    }

    /// The route's ends, as the plan names them (C81, KDLH).
    var dep: String
    var dest: String
    /// The airplane by its N-number, where one is picked.
    var tail: String?
}
#endif
