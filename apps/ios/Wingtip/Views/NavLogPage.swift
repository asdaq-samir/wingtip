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
                    plannedLine.padding(.horizontal, WingtipSpace.lg).padding(.bottom, WingtipSpace.sm)
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
        // Why its Share sent nothing, under the bar it was asked from.
        .safeAreaInset(edge: .top, spacing: 0) {
            if let shareProblem = plan.shareProblem {
                ProblemLine(shareProblem).padding(.horizontal, WingtipSpace.lg)
            }
        }
        // A long list: its rows soften under the bar, and
        // the bar folds away while it scrolls down (iOS 27).
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
                } footer: {
                    plannedLine
                }
                if let leg = plan.totals?.alternate { AlternateLegRow(leg: leg) }
                Section("Profile") {
                    // Read only, the ground coloured against the altitude flown
                    // as the Profile card colours it (`profile_clearance`).
                    let clear = plan.altitudeFt.flatMap { ft in plan.profile.map { p in Result { try ProfileRules.clearance(altitudeFt: ft, profile: p, legs: plan.legs) } } }
                    ProfileChart(profile: plan.profile, legs: plan.legs, previewFt: nil, clearance: try? clear?.get())
                        .frame(height: 180)
                        .listRowInsets(EdgeInsets())
                    ProblemLine(plan.sideProblems[.profile])
                    // The ground left uncoloured is said, never taken for clear.
                    if let clear { ProblemLine(clear, "The ground's clearance") }
                }
                Section {
                    // The nav log kept, shown with no signal, with its age.
                    KeptAgeLine(kind: .plan, key: ReadyToFly.flightKey(plan))
                    ProblemLine(plan.sideProblems[.checkpoints])
                    ForEach(Array(plan.legs.enumerated()), id: \.element.id) { i, leg in
                        // The one Route Leg card, pushed in the nav log's own card.
                        let index = RouteLegModel.index(of: leg, at: i, plan: plan)
                        NavigationLink(value: SheetPage.leg(index)) { LegRow(leg: leg, number: i + 1) }
                            .siriSees(SiriSaw.waypoint(leg.to))
                    }
                } header: {
                    // The page is titled Nav Log; its section says at what.
                    if let feet = plan.altitudeFt { Text("Legs · \(Format.cruiseAltitude(feet))") } else { Text("Legs") }
                }
            }
        }
    }

    /// When the plan was made and whose winds aloft it flies, for when
    /// (Self.plannedWords), under the totals as the web's nav log says it.
    @ViewBuilder private var plannedLine: some View {
        if let words = Self.plannedWords(plan.totals) {
            Text(words)
                .font(WingtipType.note)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityIdentifier("navlog-planned")
        }
    }

    /// When a plan was made and the winds-aloft forecast it flies, as paper
    /// says them and as the web's nav log does (plannedWords): "Planned
    /// 1212Z · AWC winds, 12Z · for use 1200–1400Z", the winds named by the
    /// planner (`winds.label`, wingtip.winds_aloft) and their "for use"
    /// window its own (FAA Order JO 7110.10 TBL 9-3-1 for the GFS's FB
    /// stations); "Planned 1212Z · winds for use …" with no name; nil where
    /// the totals do not say when.
    static func plannedWords(_ totals: Totals?) -> String? {
        guard let at = AirportWords.date(totals?.plannedAt) else { return nil }
        let planned = "Planned \(Format.zulu(at))"
        guard let winds = totals?.winds, let from = AirportWords.date(winds.useFrom), let to = AirportWords.date(winds.useTo) else {
            return planned
        }
        let forUse = "for use \(Format.zulu(from).prefix(4))–\(Format.zulu(to))"
        if let label = winds.label, !label.isEmpty { return "\(planned) · \(label) · \(forUse)" }
        return "\(planned) · \(winds.modelled == true ? "modelled winds" : "winds") \(forUse)"
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

/// Under IFR with an alternate filed, the leg on to it (14 CFR
/// 91.167(a)(2)), as the planner worked it out with the engine's
/// navlog_alternate_leg: at the route's last altitude in its winds, or in
/// still air where they could not be read, which it says. With no
/// airplane, the miles alone.
struct AlternateLegRow: View {
    let leg: APIAlternateLeg

    var body: some View {
        Section("Alternate") {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text("On to \(leg.ident)").font(.headline)
                Text([Format.distance(leg.distanceNm, decimals: 0), Format.cruiseAltitude(leg.altitudeFt),
                      leg.eteMin.map(Format.navLogTime), leg.fuelGal.map { Format.fuel($0) }].compactMap { $0 }.joined(separator: " · "))
                    .font(WingtipType.detail.monospacedDigit()).foregroundStyle(.secondary)
                if leg.stillAir == true {
                    Text("In still air: the winds there couldn't be read.").font(.footnote).foregroundStyle(WingtipInk.caution)
                }
            }
            .accessibilityElement(children: .combine)
        }
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
    /// from true north (FAA Aviation Weather Handbook, FAA-H-8083-28B 27.2.1.1.1, the
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
