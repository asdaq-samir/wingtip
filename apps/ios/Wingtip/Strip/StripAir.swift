import SwiftUI

/// The strip in the air: the ribbon with the airplane on it, the flown
/// part grey and the way ahead magenta; the next point large with the
/// leg's heading from the nav log and the miles to it; the flight's
/// figures counting down (FiguresStrip, the planner's own); and the
/// field as the radio under them (StripFieldRow with `flying`). Controls
/// are 60 points here, as the canvas asks in the air.
struct StripAir: View {
    let points: [StripPoint]
    let position: (leg: Int, along: Double)?
    /// The airplane's fix, the dry run's or own ship's.
    let fix: OwnShip.Fix?
    @Environment(\.chartInk) private var ink

    private var next: StripPoint? { StripData.nextPoint(points, position: position) }

    /// The miles from the airplane to the next point; nil with no fix or
    /// no place for the point.
    private func toGo(_ next: StripPoint) -> Result<Double, any Error>? {
        guard let fix, let at = next.coordinate else { return nil }
        return Result { try Flight.distanceNm(fix.coordinate, at) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            RibbonLine(points: points, position: position).padding(.horizontal, WingtipSpace.xs)
            if let next {
                HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.md) {
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text("Next").condensedCaps(.caption).foregroundStyle(ink.muted)
                        Text(next.name)
                            .font(ChartInk.figure(28))
                            .foregroundStyle(next.field ? ink.field : ink.brown)
                            .lineLimit(1).minimumScaleFactor(0.7)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // The heading needs the airplane's airspeed against the
                    // wind; with no airplane chosen the planner sends none,
                    // and the strip shows no heading rather than a guess.
                    if let heading = next.leg?.magneticHeadingDeg {
                        VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                            Text("MH").condensedCaps(.caption).foregroundStyle(ink.muted)
                            Text(Format.heading(heading)).font(ChartInk.figure(28))
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("Magnetic heading \(SpokenFigures.degrees(heading))")
                    }
                    // The miles to go are the engine's (`distance_nm`); where
                    // it cannot say them, that is said under the row.
                    if case .success(let nm)? = toGo(next) {
                        VStack(alignment: .trailing, spacing: WingtipSpace.xxs) {
                            Text("To go").condensedCaps(.caption).foregroundStyle(ink.muted)
                            Text(Format.number(nm, decimals: nm < 10 ? 1 : 0)).font(ChartInk.figure(28))
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel("\(SpokenFigures.nauticalMiles(nm)) to go")
                    }
                }
                .padding(WingtipSpace.lg)
                .inkCard()
                if let toGo = toGo(next) { ProblemLine(toGo, "The miles to go") }
            }
            FiguresStrip()
                .padding(.vertical, WingtipSpace.sm)
                .inkCard()
        }
        .accessibilityIdentifier("strip-air")
    }
}
