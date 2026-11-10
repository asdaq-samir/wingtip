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
                    // The nav log kept, shown with no signal, with its age.
                    KeptAgeLine(kind: .plan, key: ReadyToFly.flightKey(plan))
                    ForEach(Array(plan.legs.enumerated()), id: \.element.id) { i, leg in
                        NavigationLink(value: leg) { LegRow(leg: leg, number: i + 1) }.cardSource(leg.id).siriSees(SiriSaw.waypoint(leg.to))
                    }
                } header: {
                    // The page is titled Nav Log; its section says at what.
                    if let feet = plan.altitudeFt { SectionTitle("Nav Log · \(Format.cruiseAltitude(feet))") }
                }
            }
        }
        .navigationTitle("Nav Log")
        // A long list: its rows soften under the bar and the tab bar, and
        // the bar folds away while it scrolls down (iOS 27).
        .glassScrollEdges()
        .navigationBarMinimizesOnScroll()
    }
}

/// A leg's row: where to, the magnetic heading, the distance, the time
/// and the fuel, the figures the kneeboard wants at a glance.
struct LegRow: View {
    let leg: Leg
    /// The leg's place in the route from one, said first so VoiceOver's
    /// list reads as the nav log's rows do; nil where it is not known.
    var number: Int?

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
        .accessibilityLabel(Self.spoken(leg, number: number))
    }

    /// The row as a pilot reads a nav log aloud: "Leg 2, KDPA to KRFD,
    /// heading zero nine zero degrees magnetic, ninety-eight knots, wind
    /// two seven zero degrees true at twelve knots, twenty nautical miles,
    /// twelve minutes, one point four gallons". The winds aloft are given
    /// from true north (FAA Aviation Weather Handbook, FAA-H-8083-28, the
    /// winds and temperatures aloft forecast), the nav log's heading and
    /// course magnetic, so each says which.
    static func spoken(_ leg: Leg, number: Int?) -> String {
        var parts = [number.map { "Leg \($0), \(leg.from) to \(leg.to)" } ?? "\(leg.from) to \(leg.to)"]
        if let heading = leg.magneticHeadingDeg {
            parts.append("heading \(Format.spokenHeadingMagnetic(heading))")
        } else {
            parts.append("course \(Format.spokenHeadingMagnetic(leg.magneticCourseDeg))")
        }
        if let gs = leg.groundspeedKt { parts.append("ground speed \(Format.spokenSpeed(gs))") }
        if let wind = leg.wind {
            parts.append("wind \(Format.spokenHeadingTrue(wind.windDirTrueDeg)) at \(Format.spokenSpeed(wind.windSpeedKt))")
        }
        parts.append(Format.spokenDistance(leg.distanceNm))
        if let ete = leg.eteMin { parts.append(Format.spokenDuration(ete)) }
        if let fuel = leg.fuelGal { parts.append(Format.spokenFuel(fuel)) }
        return parts.joined(separator: ", ")
    }
}

#Preview("NavLogPage") {
    NavigationStack { NavLogPage() }
        .environment(Plan())
}
