import Foundation

/// The runway landed on at a field the route flies an approach to (the
/// web's landingRunway, owner rec 10): the approach's own, straight in,
/// unless the pilot picked another that the plate publishes circling
/// minimums for (AIM 5-4-20, 14 CFR 91.175); a pick into the wind gives
/// way to it. The rule is the engine's `landing_runway`, so the phones and
/// the web land on the same runway: KDLH with the ILS 09 reads "Land RWY 9".
enum LandingRunway {
    struct Answer: Equatable {
        /// The runway landed on, as painted ("9", "8L"); nil where none is
        /// picked and the approach has none of its own.
        let runway: String?
        /// Whether another runway may be picked (no approach, one circling
        /// only, or a plate with circling minimums).
        let othersAllowed: Bool
    }

    /// The landing at `ident`: the approach picked there (its runway from
    /// the field's procedures, once they are in) against the pilot's own
    /// pick. `circling` is the plate's, nil until it is in, which the
    /// engine takes as no circling. Nil where the engine refused, and the
    /// pilot's pick then stands as before.
    static func at(_ ident: String, approach: ProcedurePick?, procedures: ProcedureList?,
                   picked: String?, circling: Bool? = nil) -> Answer? {
        let own = approach.flatMap { pick in procedures?.procedures.first { $0.id == pick.id }?.runway }
        guard let answer = try? Engine.landingRunway(approach: approach != nil, straightIn: own, circling: circling,
                                                     picked: picked, byPilot: picked != nil) else { return nil }
        return Answer(runway: answer.runway, othersAllowed: answer.othersAllowed)
    }
}
