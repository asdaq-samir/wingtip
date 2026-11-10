import SwiftUI

/// The nav log, behind the route box's ••• as the web keeps it
/// (docs/decisions/0029, the owner's of 2026-11-09: no inline nav log at
/// full height), laid out as docs/design/ios.md §4 has it: a large title
/// whose bar folds away on scroll, the totals as one facts row, the
/// route from the side (Swift Charts), then the legs: a row each on a
/// compact width, each opening its detail, and a Table with sortable
/// columns where the width is regular (the iPad, a wide window). Share
/// (the kneeboard's PDF among the rest) is pinned in the bar.
struct NavLogPage: View {
    @Environment(Plan.self) private var plan
    @Environment(\.horizontalSizeClass) private var width

    var body: some View {
        Group {
            if width == .regular, !plan.legs.isEmpty {
                VStack(spacing: 0) {
                    totals.padding(.vertical, WingtipSpace.md)
                    NavLogTable(legs: plan.legs)
                }
            } else {
                list
            }
        }
        .navigationTitle("Nav Log")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .pinnedTrailing) { ShareMenu() }
        }
        // A long list: its rows soften under the bar, and
        // the bar folds away while it scrolls down (iOS 27).
        .glassScrollEdges()
        .navigationBarMinimizesOnScroll()
    }

    private var list: some View {
        List {
            if plan.legs.isEmpty {
                ContentUnavailableView(plan.planning ? "Planning…" : "No Legs Yet", systemImage: WingtipIcon.navLog,
                                       description: Text(plan.planning ? "The legs come in as the planner works them out." : "Plan the route first.")
                                           // The system's secondary label: the view's own grey read
                                           // faint in the iPad's glass sidebar (the audit, 2026-11-09).
                                           .foregroundStyle(Color(.secondaryLabel)))
            } else {
                Section {
                    totals.listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
                Section(title: "Profile") {
                    ProfileChart(profile: plan.profile, legs: plan.legs, altitudeFt: plan.altitudeFt, selection: plan.altitude?.altitudeSelection)
                        .frame(height: 180)
                        .listRowInsets(EdgeInsets())
                }
                Section {
                    // The nav log kept, shown with no signal, with its age.
                    KeptAgeLine(kind: .plan, key: ReadyToFly.flightKey(plan))
                    ForEach(Array(plan.legs.enumerated()), id: \.element.id) { i, leg in
                        NavigationLink(value: SheetPage.leg(leg)) { LegRow(leg: leg, number: i + 1) }.cardSource(leg.id).siriSees(SiriSaw.waypoint(leg.to))
                    }
                } header: {
                    // The page is titled Nav Log; its section says at what.
                    if let feet = plan.altitudeFt { SectionTitle("Legs · \(Format.cruiseAltitude(feet))") } else { SectionTitle("Legs") }
                }
            }
        }
    }

    /// The route's totals as the planner gave them: distance, time, fuel
    /// and the reserve kept. A dash where there is no airplane to work a
    /// time or fuel out for (docs/decisions/0011).
    private var totals: some View {
        let t = plan.totals
        return FactsRow(facts: [
            .init(label: "Distance", value: t.map { Format.distance($0.distanceNm, decimals: 0) } ?? "—",
                  spoken: t.map { SpokenFigures.nauticalMiles($0.distanceNm.rounded()) }),
            .init(label: "ETE", value: t?.eteMin.map(Format.navLogTime) ?? "—", spoken: t?.eteMin.map(SpokenFigures.minutes)),
            .init(label: "Fuel", value: t?.fuelGal.map { Format.fuel($0) } ?? "—", spoken: t?.fuelGal.map(SpokenFigures.gallons)),
            .init(label: "Reserve", value: t?.reserveMin.map(Format.navLogTime) ?? "—", spoken: t?.reserveMin.map(SpokenFigures.minutes)),
        ])
        .padding(.horizontal, WingtipSpace.lg)
    }
}

/// The legs as a Table on a regular width (the iPad, a wide window):
/// columns the pilot can sort, each figure the engine's, tabular digits.
/// The compact width keeps the rows (HIG: no sideways scrolling on the
/// iPhone).
struct NavLogTable: View {
    let legs: [Leg]
    @State private var order = [KeyPathComparator(\NavLogTable.Row.number)]

    struct Row: Identifiable {
        let number: Int
        let leg: Leg
        var id: String { leg.id + "#\(number)" }
        var to: String { leg.to }
        var course: Double { leg.magneticHeadingDeg ?? leg.magneticCourseDeg }
        var distance: Double { leg.distanceNm }
        var groundspeed: Double { leg.groundspeedKt ?? -1 }
        var ete: Double { leg.eteMin ?? -1 }
        var fuel: Double { leg.fuelGal ?? -1 }
        var altitude: Double { leg.altitudeFt }
    }

    var body: some View {
        let rows = legs.enumerated().map { Row(number: $0.offset + 1, leg: $0.element) }.sorted(using: order)
        Table(rows, sortOrder: $order) {
            TableColumn("Leg", value: \.number) { Text("\($0.number)").monospacedDigit() }
            TableColumn("To", value: \.to) { Text($0.to).font(.body.monospaced()) }
            TableColumn("Alt", value: \.altitude) { Text(Format.cruiseAltitude($0.altitude)).monospacedDigit() }
            TableColumn("MH", value: \.course) { row in
                Text(row.leg.magneticHeadingDeg.map(Format.heading) ?? "CRS \(Format.heading(row.leg.magneticCourseDeg))").monospacedDigit()
            }
            TableColumn("Dist", value: \.distance) { Text(Format.distance($0.distance)).monospacedDigit() }
            TableColumn("GS", value: \.groundspeed) { Text($0.leg.groundspeedKt.map(Format.speed) ?? "—").monospacedDigit() }
            TableColumn("ETE", value: \.ete) { Text($0.leg.eteMin.map(Format.navLogTime) ?? "—").monospacedDigit() }
            TableColumn("Fuel", value: \.fuel) { Text($0.leg.fuelGal.map { Format.fuel($0) } ?? "—").monospacedDigit() }
        }
        .accessibilityLabel("Nav log legs")
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
