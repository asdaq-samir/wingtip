import SwiftUI

/// One leg's figures in full, the Route Leg card's sections under its
/// ends and actions (RouteLegView), as the nav log's row opens in the web
/// app: the course, the wind and its correction, the headings true and
/// magnetic with the variation between them, the speeds, the time and the
/// fuel, and where the climb and the descent fall. Every figure the
/// planner's.
struct LegFigureSections: View {
    let leg: Leg

    var body: some View {
        Group {
            // Each figure's accessibilityValue is the figure as a pilot says
            // it (SpokenFigures), where "090°" would be read as "ninety".
            Section("Course and Heading") {
                LabeledContent("True course", value: Format.heading(leg.trueCourseDeg))
                    .accessibilityValue(SpokenFigures.degrees(leg.trueCourseDeg))
                if let wind = leg.wind {
                    let (dir, kt) = (wind.windDirTrueDeg, wind.windSpeedKt)
                    LabeledContent("Wind", value: "\(Format.heading(dir)) at \(Format.speed(kt))")
                        .accessibilityValue("\(SpokenFigures.degrees(dir)) at \(SpokenFigures.knots(kt))")
                }
                // The correction and the headings need the airplane's
                // airspeed against the wind: with no airplane chosen the
                // planner sends none, and their rows are left out.
                if let wca = leg.wcaDeg {
                    LabeledContent("Wind correction", value: "\(wca >= 0 ? "+" : "")\(Format.number(wca, decimals: 0))°")
                        .accessibilityValue("\(wca < 0 ? "minus" : "plus") \(SpokenFigures.number(abs(wca))) degrees")
                }
                if let heading = leg.trueHeadingDeg {
                    LabeledContent("True heading", value: Format.heading(heading))
                        .accessibilityValue(SpokenFigures.degrees(heading))
                }
                LabeledContent("Variation", value: "\(Format.number(abs(leg.magneticVariationDeg), decimals: 0))° \(Flight.variationSide(leg.magneticVariationDeg).letter)")
                    .accessibilityValue("\(SpokenFigures.number(abs(leg.magneticVariationDeg))) degrees \(Flight.variationSide(leg.magneticVariationDeg).word)")
                if let heading = leg.magneticHeadingDeg {
                    LabeledContent("Magnetic heading", value: Format.heading(heading))
                        .accessibilityValue(SpokenFigures.degrees(heading))
                }
            }
            // A leg flown whole in the climb or the descent states that
            // phase's figures (the engine's `phase`), and its section says so.
            Section(LegPhase.of(leg).map { "Speed, Time and Fuel · \($0.word)" } ?? "Speed, Time and Fuel") {
                LabeledContent("Altitude", value: Format.altitude(leg.altitudeFt))
                    .accessibilityValue(Format.spokenAltitude(leg.altitudeFt))
                if let tas = leg.tasKt { LabeledContent("True airspeed", value: Format.speed(tas)).accessibilityValue(SpokenFigures.knots(tas)) }
                if let gs = leg.groundspeedKt { LabeledContent("Groundspeed", value: Format.speed(gs)).accessibilityValue(SpokenFigures.knots(gs)) }
                LabeledContent("Distance", value: Format.distance(leg.distanceNm))
                    .accessibilityValue(SpokenFigures.nauticalMiles(leg.distanceNm))
                if let ete = leg.eteMin { LabeledContent("Time", value: Format.duration(ete)).accessibilityValue(SpokenFigures.minutes(ete)) }
                if let fuel = leg.fuelGal { LabeledContent("Fuel", value: Format.fuel(fuel)).accessibilityValue(SpokenFigures.gallons(fuel)) }
                if let climb = leg.climbMin, climb > 0 { LabeledContent("Climbing", value: Format.duration(climb)).accessibilityValue(SpokenFigures.minutes(climb)) }
                // No climb fuel flow in the airplane's profile: the climb's
                // fuel is missing, never nought (AV-8, decision 0011), and
                // the figure is asked for in place.
                if leg.climbFuelUnknown == true {
                    LabeledContent("Climb fuel", value: "Not known")
                        .foregroundStyle(WingtipInk.caution)
                    AskFigureRow(needs: [.climb])
                }
            }
            // Where the climb tops out and the descent starts, each piece in
            // its own phase's figures (LegPhase).
            LegTopsSection(leg: leg)
        }
    }
}

#Preview("LegFigureSections") {
    List {
        LegFigureSections(leg: Leg.preview(from: "KDLH", to: "KHIB", distanceNm: 62.4, altitudeFt: 4500, trueCourseDeg: 318, magneticHeadingDeg: 315, wcaDeg: -4, trueHeadingDeg: 314, magneticVariationDeg: -1, climbMin: 6, groundspeedKt: 104, eteMin: 36, fuelGal: 5.1, tasKt: 112, wind: APIWind(windDirTrueDeg: 270, windSpeedKt: 12)))
    }
}
