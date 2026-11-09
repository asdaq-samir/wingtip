import SwiftUI

/// The nav log, behind the route box's ••• as the web keeps it
/// (docs/decisions/0029, the owner's of 2026-11-09: no inline nav log at
/// full height): a leg a row, its header the cruise altitude as the cruise
/// controls write it (FL-045), each leg opening its detail.
struct NavLogPage: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        List {
            if plan.legs.isEmpty {
                Text(plan.planning ? "Planning…" : "No legs yet: plan the route first.").foregroundStyle(.secondary)
            } else {
                Section {
                    ForEach(plan.legs) { leg in
                        NavigationLink(value: leg) { LegRow(leg: leg) }
                    }
                } header: {
                    // The page is titled Nav Log; its section says at what.
                    if let feet = plan.altitudeFt { SectionTitle("Nav Log · \(Format.cruiseAltitude(feet))") }
                }
            }
        }
        .navigationTitle("Nav Log")
    }
}

/// A leg's row: where to, the magnetic heading, the distance, the time
/// and the fuel, the figures the kneeboard wants at a glance.
struct LegRow: View {
    let leg: Leg

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                Text(leg.to).font(WingtipType.title)
                HStack(spacing: WingtipSpace.md) {
                    // No heading without an airplane (the wind's correction
                    // is at its speed): the leg's magnetic course in its
                    // place, said as one (docs/decisions/0011).
                    if let heading = leg.magneticHeadingDeg {
                        Text(Format.heading(heading))
                    } else {
                        Text("CRS \(Format.heading(leg.magneticCourseDeg))")
                    }
                    if let gs = leg.groundspeedKt { Text(Format.speed(gs)) }
                    if let wind = leg.wind {
                        Text("\(Format.heading(wind.windDirTrueDeg)) \(Format.speed(wind.windSpeedKt))")
                    }
                }
                .font(WingtipType.note.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: WingtipSpace.xs) {
                Text(Format.distance(leg.distanceNm)).font(WingtipType.detail.monospacedDigit())
                HStack(spacing: WingtipSpace.sm) {
                    if let ete = leg.eteMin { Text(Format.navLogTime(ete)) }
                    if let fuel = leg.fuelGal { Text(Format.fuel(fuel)) }
                }
                .font(WingtipType.note.monospacedDigit())
                .foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spoken)
    }

    /// The row as a pilot reads a nav log aloud: "To KHIB, heading zero
    /// nine zero, ninety-eight knots, wind two seven zero at twelve, twenty
    /// nautical miles, twelve minutes, one point four gallons".
    private var spoken: String {
        var parts = ["To \(leg.to)"]
        if let heading = leg.magneticHeadingDeg {
            parts.append("heading \(SpokenFigures.degrees(heading))")
        } else {
            parts.append("course \(SpokenFigures.degrees(leg.magneticCourseDeg))")
        }
        if let gs = leg.groundspeedKt { parts.append(SpokenFigures.knots(gs)) }
        if let wind = leg.wind {
            parts.append("wind \(SpokenFigures.degrees(wind.windDirTrueDeg)) at \(SpokenFigures.number(wind.windSpeedKt))")
        }
        parts.append(SpokenFigures.nauticalMiles(leg.distanceNm))
        if let ete = leg.eteMin { parts.append(SpokenFigures.minutes(ete)) }
        if let fuel = leg.fuelGal { parts.append(SpokenFigures.gallons(fuel)) }
        return parts.joined(separator: ", ")
    }
}

#Preview("NavLogPage") {
    NavigationStack { NavLogPage() }
        .environment(Plan())
}
