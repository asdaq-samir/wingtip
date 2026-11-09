import SwiftUI

/// One leg in full, as the nav log's row opens in the web app: the
/// course, the wind and its correction, the headings true and magnetic
/// with the variation between them, the speeds, the time and the fuel,
/// and where the climb and the descent fall. Every figure the planner's.
struct LegDetailView: View {
    let leg: Leg

    var body: some View {
        List {
            // Each figure's accessibilityValue is the figure as a pilot says
            // it (SpokenFigures), where "090°" would be read as "ninety".
            Section(title: "Course and Heading") {
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
            Section(title: "Speed, Time and Fuel") {
                LabeledContent("Altitude", value: Format.altitude(leg.altitudeFt))
                    .accessibilityValue(Format.spokenAltitude(leg.altitudeFt))
                if let tas = leg.tasKt { LabeledContent("True airspeed", value: Format.speed(tas)).accessibilityValue(SpokenFigures.knots(tas)) }
                if let gs = leg.groundspeedKt { LabeledContent("Groundspeed", value: Format.speed(gs)).accessibilityValue(SpokenFigures.knots(gs)) }
                LabeledContent("Distance", value: Format.distance(leg.distanceNm))
                    .accessibilityValue(SpokenFigures.nauticalMiles(leg.distanceNm))
                if let ete = leg.eteMin { LabeledContent("Time", value: Format.duration(ete)).accessibilityValue(SpokenFigures.minutes(ete)) }
                if let fuel = leg.fuelGal { LabeledContent("Fuel", value: Format.fuel(fuel)).accessibilityValue(SpokenFigures.gallons(fuel)) }
                if let climb = leg.climbMin, climb > 0 { LabeledContent("Climbing", value: Format.duration(climb)).accessibilityValue(SpokenFigures.minutes(climb)) }
            }
            if leg.toc != nil || leg.tod != nil {
                Section(title: "Climb and Descent") {
                    if let along = leg.toc?.alongNm { LabeledContent("Top of climb", value: "\(Format.distance(along)) along") }
                    if let along = leg.tod?.alongNm { LabeledContent("Top of descent", value: "\(Format.distance(along)) along") }
                }
            }
        }
        .navigationTitle("\(leg.from) → \(leg.to)")
        .navigationBarTitleDisplayMode(.inline)
    }
}

#Preview("LegDetailView") {
    NavigationStack {
        LegDetailView(leg: Leg.preview(from: "KDLH", to: "KHIB", distanceNm: 62.4, altitudeFt: 4500, trueCourseDeg: 318, magneticHeadingDeg: 315, wcaDeg: -4, trueHeadingDeg: 314, magneticVariationDeg: -1, climbMin: 6, groundspeedKt: 104, eteMin: 36, fuelGal: 5.1, tasKt: 112, wind: APIWind(windDirTrueDeg: 270, windSpeedKt: 12)))
    }
}
