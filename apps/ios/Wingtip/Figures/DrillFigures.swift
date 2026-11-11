import Foundation

extension HoldingAnswer {
    /// A hold's entry by AIM 5-3-8 and, given the true airspeed, the wind
    /// and the altitude, its wind-corrected headings and outbound time
    /// (AIM 5-3-8; 14 CFR 91.185's holds), the engine's `holding`; thrown
    /// where it cannot answer, which the page says.
    static func of(inbound: Double, heading: Double, turns: String, tasKt: Double?, windFrom: Double?, windKt: Double?, altitudeFt: Double?) throws -> HoldingAnswer {
        try Engine.holding(inbound: inbound, heading: heading, turns: turns, tasKt: tasKt, windFrom: windFrom, windKt: windKt, altitudeFt: altitudeFt)
    }
}

extension LostCommsAnswer {
    /// What to fly on each segment with two-way radio failure, 14 CFR
    /// 91.185(c)(2), the engine's `lost_comms`; thrown where it cannot
    /// answer, which the page says.
    static func of(_ ask: EngineContract.LostCommsInput) throws -> LostCommsAnswer {
        try Engine.lostComms(segments: ask.segments, assignedFt: ask.assignedFt, expectedFt: ask.expectedFt,
                             expectedFrom: ask.expectedFrom, approachFix: ask.approachFix, efc: ask.efc, eta: ask.eta)
    }
}
