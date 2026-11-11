import Foundation

// Made-up legs and totals for the screens' previews and the tests: the
// generated models (API/Generated) take every member the planner always
// sends, so these give the ones a preview does not care about a value.

extension Leg {
    static func preview(from: String, to: String, distanceNm: Double, altitudeFt: Double = 4500, trueCourseDeg: Double,
                        magneticHeadingDeg: Double, wcaDeg: Double = 0, trueHeadingDeg: Double? = nil, magneticVariationDeg: Double = 0,
                        climbMin: Double? = nil, groundspeedKt: Double? = nil, eteMin: Double? = nil, fuelGal: Double? = nil,
                        tasKt: Double = 112, wind: APIWind? = nil, toc: APITopOfClimb? = nil, tod: APITopOfDescent? = nil,
                        groundMin: Double? = nil) -> Leg {
        Leg(airway: nil, altitudeFt: altitudeFt, climbMin: climbMin, densityAltitudeFt: altitudeFt, distanceNm: distanceNm, eteMin: eteMin,
            from: from, fuelBurnGph: 8.5, fuelGal: fuelGal, groundMin: groundMin, groundspeedKt: groundspeedKt, hold: nil,
            magneticCourseDeg: trueCourseDeg - magneticVariationDeg, magneticHeadingDeg: magneticHeadingDeg,
            magneticVariationDeg: magneticVariationDeg, oatC: nil, powerPct: 75, procedure: nil, tasKt: tasKt, to: to, toc: toc, tod: tod,
            trueCourseDeg: trueCourseDeg, trueHeadingDeg: trueHeadingDeg ?? trueCourseDeg + wcaDeg, wcaDeg: wcaDeg, wind: wind)
    }
}

extension Totals {
    static func preview(distanceNm: Double, eteMin: Double? = nil, fuelGal: Double? = nil, fuelMarginGal: Double? = nil,
                        fuelRequiredGal: Double? = nil, usableFuelGal: Double? = nil, night: Bool? = nil) -> Totals {
        Totals(alternate: nil, distanceNm: distanceNm, eteMin: eteMin, fuelGal: fuelGal, fuelMarginGal: fuelMarginGal,
               fuelRequiredGal: fuelRequiredGal, fuelStops: nil, groundMin: nil, hops: nil, legsWithoutWind: 0, night: night,
               nightPassengers: nil, plannedAt: nil, procedureNm: nil, reserveGal: nil, reserveMin: nil, rules: nil, taxiGal: nil,
               unflyableLegs: 0, usableFuelGal: usableFuelGal, winds: nil)
    }
}
