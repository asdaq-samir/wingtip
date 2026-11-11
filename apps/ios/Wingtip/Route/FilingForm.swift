import Foundation

/// FAA Form 7233-4's items as AIM Appendix 4 writes them: the engine's
/// (`filed_speed`, `filed_level`, `filed_route`, `filed_duration`), the
/// very ones the web app's lib/flightPlanForm asks. Each throws where the
/// engine cannot write the item, and nothing is filed then.
enum FilingForm {
    /// Item 15's cruising speed, "N0450".
    static func cruisingSpeed(_ tasKt: Double) throws -> String { try Engine.filedSpeed(tasKt: tasKt) }

    /// Item 15's level: "F350" at and above 18,000 ft, "A080" below it
    /// (14 CFR 91.121(a)(2)).
    static func cruisingLevel(_ altitudeFt: Double) throws -> String { try Engine.filedLevel(ft: altitudeFt) }

    /// An airway as a route names one: Victor, T, Jet or Q and its number
    /// (the web app's identSchema isAirwayToken).
    static func airwayToken(_ stop: String) -> Bool {
        stop.range(of: "^[VTJQ][0-9]{1,4}$", options: .regularExpression) != nil
    }

    /// Item 15's route between the ends ("FLACK DCT IRW", "EIC V18 MEI");
    /// its procedures are not filed from here yet.
    static func route(_ stops: [String], isAirway: (String) -> Bool = FilingForm.airwayToken) throws -> String {
        try Engine.filedRoute(stops: stops, airways: stops.filter(isAirway))
    }

    /// Hours and minutes in four figures, HHMM (items 16 and 19).
    static func hhmm(_ minutes: Int) throws -> String { try Engine.filedDuration(minutes: Double(minutes)) }
}
