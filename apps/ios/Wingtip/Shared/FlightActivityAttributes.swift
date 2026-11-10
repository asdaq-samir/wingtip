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
    /// Where the flight is, as Flighty's Live Activity changes with it
    /// (Apple's "Spotlight on the Dynamic Island", docs/design/ios.md
    /// §15): started on the ground and not yet flying, in the air, or
    /// landed and at rest.
    enum Phase: String, Codable, Hashable, Sendable {
        case ready, airborne, arrived
    }

    struct ContentState: Codable, Hashable, Sendable {
        /// The flight's phase; nil in a state sent before phases, read as
        /// in the air.
        var phase: Phase?
        /// How much of the route is flown, 0 to 1: the engine's miles along
        /// it over its length (in_flight's along_nm and total_nm); nil
        /// before the first fix.
        var progress: Double?
        /// The miles to the next point, the engine's (in_flight next).
        var nextNm: Double?
        /// Before departure: the departure's flight category as the Brief
        /// had it, and the planner's time en route for the whole flight.
        var depCategory: String?
        var plannedEteMin: Double?
        /// Arrived: when the airplane came to rest, and the minutes from
        /// the activity's start to then (the block time as the phone saw it).
        var landedAt: Date?
        var blockMin: Double?
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
        /// The route's weather gone worse since the Brief, in the engine's
        /// words (WeatherWatch, weather_worse); nil while it has not.
        var weather: String?
        var updatedAt: Date
    }

    /// The route's ends, as the plan names them (C81, KDLH).
    var dep: String
    var dest: String
    /// The airplane by its N-number, where one is picked.
    var tail: String?
}
#endif
