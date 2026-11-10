import Charts
import SwiftUI

/// The route from the side, as the web app's Profile card has it: the
/// ground and the airspace under the line, the altitude flown across
/// them, a wheel of altitudes to fly instead -- the planner's legal ones
/// named for their plans, and every 500 ft besides, "Outside the limits",
/// flown with its warnings, never refused (the owner's rule) -- the four
/// plans by name, and the altitude's cautions.
struct ProfileCard: View {
    @Environment(Plan.self) private var plan
    @Environment(DryRun.self) private var dryRun
    @State private var picked: Double?
    @AppStorage(FlightRules.key) private var rules: FlightRules = .vfr
    @Environment(\.horizontalSizeClass) private var sizeClass
    @Environment(\.dynamicTypeSize) private var typeSize

    /// The wheel's rows, highest first: the planner's legal altitudes, the
    /// one flown and every 500 ft from 1,000 ft under Class A (14 CFR
    /// 71.33) -- the engine's `altitude_wheel`, as the web's wheel asks it.
    private var wheel: Result<[Double], any Error> {
        let legal = plan.altitude?.altitudeFigures?.map(\.altitudeFt) ?? []
        return Result { try Engine.altitudeWheel(legalFt: legal, flownFt: plan.altitudeFt) }
    }

    /// Where the engine cannot give the wheel (said under it), the
    /// planner's legal altitudes and the one flown alone.
    private var altitudes: [Double] {
        let legal = plan.altitude?.altitudeFigures?.map(\.altitudeFt) ?? []
        return (try? wheel.get()) ?? Set(legal + [plan.altitudeFt].compactMap { $0 }).sorted(by: >)
    }

    private var legal: Set<Double> { Set(plan.altitude?.altitudeFigures?.map(\.altitudeFt) ?? []) }

    private func name(of altitude: Double) -> String? {
        if let option = plan.altitude?.options?.first(where: { $0.altitudeFt == altitude && !$0.steps.isEmpty }) {
            return option.kind.prefix(1).uppercased() + option.kind.dropFirst()
        }
        if !legal.contains(altitude) { return "Outside the limits" }
        return nil
    }

    var body: some View {
        List {
            Section {
                // The profile, read only, and the wheel of altitudes beside
                // it where the width allows (an iPad, a wide window), under
                // it on an iPhone (the owner, 2026-11-10).
                let beside = sizeClass == .regular && !typeSize.isAccessibilitySize
                let layout = beside ? AnyLayout(HStackLayout(alignment: .center, spacing: WingtipSpace.md)) : AnyLayout(VStackLayout(spacing: 0))
                layout {
                    ProfileChart(profile: plan.profile, legs: plan.legs, altitudeFt: picked ?? plan.altitudeFt, selection: plan.altitude?.altitudeSelection)
                        .frame(height: 200)
                    altitudeWheel
                        .frame(maxWidth: beside ? 320 : .infinity)
                }
                .listRowInsets(EdgeInsets())
                // A dry run the engine could not fly (the toolbar's Dry run).
                ProblemLine(dryRun.problem)
                ProblemLine(wheel, "The wheel's altitudes")
                // Any row may be flown; one outside the planner's legal
                // altitudes is said here, its reasons in Cautions where the planner gives them.
                if let own = plan.ownAltitudeFt, !plan.ownAltitudeLegal {
                    Label("\(Format.cruiseAltitude(own)) is outside the planner's legal altitudes; flown with its warnings.",
                          systemImage: "exclamationmark.triangle")
                        .font(.footnote).foregroundStyle(WingtipInk.caution)
                }
            }
            Section("Altitude") {
                // The rules the route is planned under, here as the web's
                // altitude popover has them (FlightRules); planned again.
                Picker("Flight Rules", selection: $rules) {
                    ForEach(FlightRules.allCases) { Text($0.label).tag($0) }
                }
                .pickerStyle(.segmented)
                .onChange(of: rules) { _, _ in plan.plan() }
                if let options = plan.altitude?.options, !options.isEmpty {
                    Picker("Plan", selection: Binding(get: { plan.altitudeChoice ?? (plan.ownAltitudeFt == nil ? "fastest" : "") }, set: { choose($0) })) {
                        ForEach(options.filter { !$0.steps.isEmpty }) { option in
                            Text("\(option.kind.prefix(1).uppercased() + option.kind.dropFirst()) · \(Format.cruiseAltitude(option.altitudeFt ?? 0))").tag(option.kind)
                        }
                        if plan.ownAltitudeFt != nil { Text("Your altitude").tag("") }
                    }
                }
            }
            if let cautions = plan.altitude?.cautions, !cautions.isEmpty {
                Section {
                    ForEach(cautions) { caution in
                        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                            Text("\(Format.cruiseAltitude(caution.altitudeFt)) \(caution.fromIdent) → \(caution.toIdent)").font(.subheadline.weight(.semibold))
                            ForEach(caution.reasons, id: \.self) { Text("• \($0)").font(.footnote) }
                        }
                        .foregroundStyle(WingtipInk.caution)
                    }
                } header: {
                    Label("Cautions", systemImage: "exclamationmark.triangle")
                }
            }
            if let selection = plan.altitude?.altitudeSelection {
                Section("How the Altitude Was Chosen") {
                    LabeledContent("Floor", value: "\(Format.altitude(selection.floorFt)), the terrain and obstacles (14 CFR 91.119)")
                    if let ceiling = selection.serviceCeilingFt { LabeledContent("Ceiling", value: "\(Format.altitude(ceiling)), the airplane's") }
                    if let clouds = selection.cloudBaseFt { LabeledContent("Clouds", value: "base \(Format.altitude(clouds)) (14 CFR 91.155)") }
                    if let shelf = selection.airspaceCeilingFt { LabeledContent("Class B", value: "from \(Format.altitude(shelf)) (14 CFR 91.131)") }
                    if let candidates = selection.candidatesFt, !candidates.isEmpty {
                        LabeledContent("Legal", value: candidates.map { Format.cruiseAltitude($0) }.joined(separator: " "))
                    }
                }
            }
            // The same reasons in plain words, on the phone (AltitudeWhy).
            AltitudeWhySection(line: plan.altitude, flownFt: plan.altitudeFt, choice: plan.altitudeChoice)
        }
        .navigationTitle(plan.altitudeFt.map { Format.cruiseAltitude($0) } ?? "Profile")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // The dry run from the profile's corner, as the web app has it.
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    // Ready to fly over the start, once per flight, where
                    // something is missing; "Fly anyway" goes on with it.
                    Task {
                        await ReadyToFly.shared.beforeStart {
                            if let course = plan.course { dryRun.start(course: course, checkpoints: plan.checkpoints, legs: plan.legs) }
                        }
                    }
                } label: { Label("Dry run", systemImage: "play.fill") }
                    .disabled(plan.legs.isEmpty || plan.course == nil)
            }
        }
        .onChange(of: plan.altitudeFt) { _, _ in picked = nil }
    }

    /// The system's wheel of the engine's altitudes, highest first, opening
    /// on the one the planner picked: each row its altitude, its plan's
    /// name or "Outside the limits", and its time en route.
    private var altitudeWheel: some View {
        Picker("Cruise altitude", selection: Binding(get: { picked ?? plan.altitudeFt ?? altitudes.last ?? 0 }, set: { fly($0) })) {
            ForEach(altitudes, id: \.self) { altitude in
                let ete = plan.altitude?.altitudeFigures?.first(where: { $0.altitudeFt == altitude })?.eteMin
                HStack {
                    Text(Format.cruiseAltitude(altitude)).monospacedDigit().bold()
                    if let name = name(of: altitude) {
                        Text(name).foregroundStyle(legal.contains(altitude) ? Color.secondary : WingtipInk.caution)
                    }
                    if let ete {
                        Spacer()
                        Text(Format.duration(ete)).foregroundStyle(.secondary).monospacedDigit()
                    }
                }
                // "FL-045" read as the feet it stands for.
                .accessibilityElement(children: .ignore)
                .accessibilityLabel([Format.spokenAltitude(altitude), name(of: altitude), ete.map(SpokenFigures.minutes)].compactMap { $0 }.joined(separator: ", "))
                .tag(altitude)
            }
        }
        .pickerStyle(.wheel)
        .frame(height: 160)
    }

    /// An altitude off the wheel: a plan's where it is one's, else the
    /// pilot's own, at each leg's nearest legal altitude where the pick is
    /// legal and as it stands where it is not.
    private func fly(_ altitude: Double) {
        picked = altitude
        if let option = plan.altitude?.options?.first(where: { $0.altitudeFt == altitude && !$0.steps.isEmpty }) {
            plan.ownAltitudeFt = nil
            plan.altitudeChoice = option.kind
        } else {
            plan.altitudeChoice = nil
            plan.ownAltitudeFt = altitude
            plan.ownAltitudeLegal = legal.contains(altitude)
        }
        Feel.tap(.altitude)
        plan.plan()
    }

    private func choose(_ kind: String) {
        guard !kind.isEmpty else { return }
        plan.ownAltitudeFt = nil
        plan.altitudeChoice = kind
        Feel.tap(.altitude)
        plan.plan()
    }
}

/// The side view itself, in Swift Charts (docs/design/ios.md §4): the
/// ground as an area in the chart's terrain brown, Class B and C as faint
/// bands in the sectional's airspace blue and magenta, and the altitude
/// flown across them in the tint, its axes in feet and nautical miles.
/// Swift Charts gives VoiceOver its Audio Graph; every figure is also in
/// the rows (HIG Charts: never only in a chart). Nothing is worked out
/// here: the planner's profile and the engine's legs, drawn.
struct ProfileChart: View {
    let profile: RouteProfile?
    let legs: [Leg]
    let altitudeFt: Double?
    let selection: AltitudeSelection?

    /// The altitude line's points along the route: the legs' own where
    /// they are in, else one altitude across.
    private var flown: [(nm: Double, ft: Double)] {
        guard let profile else { return [] }
        if legs.count > 1 {
            var along = 0.0
            var points = [(nm: 0.0, ft: legs[0].altitudeFt)]
            for leg in legs {
                along += leg.distanceNm
                points.append((nm: min(along, profile.lengthNm), ft: leg.altitudeFt))
            }
            return points
        }
        return altitudeFt.map { [(nm: 0, ft: $0), (nm: profile.lengthNm, ft: $0)] } ?? []
    }

    var body: some View {
        if let profile, profile.lengthNm > 0, !profile.terrain.isEmpty {
            let highest = max(profile.terrain.map(\.groundFt).max() ?? 0, altitudeFt ?? 0, selection?.recommendedFt ?? 0, 3000)
            let top = (highest * 1.25 / 1000).rounded(.up) * 1000
            Chart {
                ForEach(Array(profile.airspace.enumerated()), id: \.offset) { _, area in
                    RectangleMark(xStart: .value("From", area.fromNm), xEnd: .value("To", area.toNm),
                                  yStart: .value("Floor", area.floorFt), yEnd: .value("Ceiling", min(area.ceilingFt ?? top, top)))
                        .foregroundStyle(Self.colour(area.airspaceClass).opacity(0.14))
                        .accessibilityLabel("Class \(area.airspaceClass), \(area.name)")
                }
                ForEach(Array(profile.terrain.enumerated()), id: \.offset) { _, point in
                    AreaMark(x: .value("Along", point.alongNm), y: .value("Ground", point.groundFt))
                        .foregroundStyle(Color(uiColor: WingtipColor.Chart.terrain).opacity(0.75))
                        .accessibilityLabel("Ground")
                }
                ForEach(Array(flown.enumerated()), id: \.offset) { _, point in
                    LineMark(x: .value("Along", point.nm), y: .value("Altitude", point.ft), series: .value("Line", "Altitude"))
                        .foregroundStyle(.tint)
                        .lineStyle(StrokeStyle(lineWidth: 2.5, lineJoin: .round))
                        .accessibilityLabel("Altitude")
                }
            }
            .chartXScale(domain: 0...profile.lengthNm)
            .chartYScale(domain: 0...top)
            .chartXAxisLabel("nm")
            .chartYAxisLabel("ft")
            .padding(WingtipSpace.md)
            .accessibilityLabel("The route from the side: the ground, the airspace and the altitude flown")
        } else {
            ContentUnavailableView("No Profile Yet", systemImage: "mountain.2", description: Text("Plan the route to see it from the side."))
        }
    }

    /// Class B in the sectional's blue, C in its magenta (FAA Chart
    /// User's Guide, Airspace), the rest grey.
    static func colour(_ airspaceClass: String) -> Color {
        switch airspaceClass {
        case "B": Color(uiColor: WingtipColor.Chart.airspaceBlue)
        case "C": Color(uiColor: WingtipColor.Chart.airspaceMagenta)
        default: Color(uiColor: WingtipColor.Chart.fieldUnknown)
        }
    }
}

private enum PreviewData {
    static let profile = RouteProfile(
        airspace: [ProfileAirspace(ceilingFt: 10_000, airspaceClass: "B", floorFt: 1500, fromNm: 0, name: "San Francisco Class B", toNm: 14)],
        lengthNm: 62,
        terrain: [
            ProfileGround(alongNm: 0, groundFt: 5), ProfileGround(alongNm: 20, groundFt: 1800),
            ProfileGround(alongNm: 40, groundFt: 2600), ProfileGround(alongNm: 62, groundFt: 95),
        ])
    static let legs = [
        Leg.preview(from: "KPAO", to: "KLVK", distanceNm: 28, altitudeFt: 4500, trueCourseDeg: 62, magneticHeadingDeg: 51, groundspeedKt: 108, eteMin: 16, fuelGal: 2.3, tasKt: 112),
        Leg.preview(from: "KLVK", to: "KMOD", distanceNm: 34, altitudeFt: 4500, trueCourseDeg: 105, magneticHeadingDeg: 94, groundspeedKt: 118, eteMin: 17, fuelGal: 2.4, tasKt: 112),
    ]
}

#Preview("ProfileCard") {
    NavigationStack { ProfileCard() }
        .environment(Plan())
        .environment(DryRun())
}

#Preview("ProfileChart") {
    ProfileChart(profile: PreviewData.profile, legs: PreviewData.legs, altitudeFt: 4500,
                 selection: AltitudeSelection(airspaceTransits: [], candidatesFt: [3500, 4500, 5500], courseMagneticDeg: 62, eastbound: true, floorFt: 1500, hazards: [], recommendedFt: 4500))
        .frame(height: 200)
        .padding()
}
