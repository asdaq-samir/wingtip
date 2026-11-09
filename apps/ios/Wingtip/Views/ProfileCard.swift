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
                ProfileChart(profile: plan.profile, legs: plan.legs, altitudeFt: picked ?? plan.altitudeFt, selection: plan.altitude?.altitudeSelection)
                    .frame(height: 200)
                    .listRowInsets(EdgeInsets())
                // A dry run the engine could not fly (the toolbar's Dry run).
                ProblemLine(dryRun.problem)
            }
            Section(title: "Altitude") {
                Picker("Cruise altitude", selection: Binding(get: { picked ?? plan.altitudeFt ?? altitudes.last ?? 0 }, set: { fly($0) })) {
                    ForEach(altitudes, id: \.self) { altitude in
                        let ete = plan.altitude?.altitudeFigures?.first(where: { $0.altitudeFt == altitude })?.eteMin
                        HStack {
                            Text(Format.cruiseAltitude(altitude)).monospacedDigit().bold()
                            if let name = name(of: altitude) {
                                Text(name).foregroundStyle(legal.contains(altitude) ? Color.secondary : Color.orange)
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
                ProblemLine(wheel, "The wheel's altitudes")
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
                        .foregroundStyle(Color.orange)
                    }
                } header: {
                    Label("Cautions", systemImage: "exclamationmark.triangle")
                }
            }
            if let selection = plan.altitude?.altitudeSelection {
                Section(title: "How the Altitude Was Chosen") {
                    LabeledContent("Floor", value: "\(Format.altitude(selection.floorFt)), the terrain and obstacles (14 CFR 91.119)")
                    if let ceiling = selection.serviceCeilingFt { LabeledContent("Ceiling", value: "\(Format.altitude(ceiling)), the airplane's") }
                    if let clouds = selection.cloudBaseFt { LabeledContent("Clouds", value: "base \(Format.altitude(clouds)) (14 CFR 91.155)") }
                    if let shelf = selection.airspaceCeilingFt { LabeledContent("Class B", value: "from \(Format.altitude(shelf)) (14 CFR 91.131)") }
                    if let candidates = selection.candidatesFt, !candidates.isEmpty {
                        LabeledContent("Legal", value: candidates.map { Format.cruiseAltitude($0) }.joined(separator: " "))
                    }
                }
            }
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

/// The side view itself, drawn: the ground in brown, Class B and C in
/// their chart colours, the altitude line across.
struct ProfileChart: View {
    let profile: RouteProfile?
    let legs: [Leg]
    let altitudeFt: Double?
    let selection: AltitudeSelection?

    var body: some View {
        Canvas { context, size in
            guard let profile, profile.lengthNm > 0, !profile.terrain.isEmpty else { return }
            let highest = max(profile.terrain.map(\.groundFt).max() ?? 0, altitudeFt ?? 0, selection?.recommendedFt ?? 0, 3000)
            let top = (highest * 1.25 / 1000).rounded(.up) * 1000
            let x = { (nm: Double) in CGFloat(nm / profile.lengthNm) * size.width }
            let y = { (ft: Double) in size.height - CGFloat(max(0, min(1, ft / top))) * size.height }
            // Airspace bands, Class B blue and Class C magenta as the chart
            // draws them, faint.
            for area in profile.airspace {
                let colour: Color = area.airspaceClass == "B" ? Color.blue : area.airspaceClass == "C" ? Color.purple : Color.gray
                let rect = CGRect(x: x(area.fromNm), y: y(area.ceilingFt ?? top), width: max(1, x(area.toNm) - x(area.fromNm)), height: max(1, y(area.floorFt) - y(area.ceilingFt ?? top)))
                context.fill(Path(rect), with: .color(colour.opacity(0.12)))
                context.stroke(Path(rect), with: .color(colour.opacity(0.5)), lineWidth: 1)
            }
            // The ground.
            var ground = Path()
            ground.move(to: CGPoint(x: 0, y: size.height))
            for point in profile.terrain { ground.addLine(to: CGPoint(x: x(point.alongNm), y: y(point.groundFt))) }
            ground.addLine(to: CGPoint(x: size.width, y: size.height))
            ground.closeSubpath()
            context.fill(ground, with: .color(Color(red: 0.55, green: 0.38, blue: 0.2).opacity(0.75)))
            // The altitude line: the legs' own where they are in, else
            // one altitude across.
            var line = Path()
            if legs.count > 1 {
                var along = 0.0
                line.move(to: CGPoint(x: 0, y: y(legs[0].altitudeFt)))
                for leg in legs {
                    along += leg.distanceNm
                    line.addLine(to: CGPoint(x: x(min(along, profile.lengthNm)), y: y(leg.altitudeFt)))
                }
            } else if let altitudeFt {
                line.move(to: CGPoint(x: 0, y: y(altitudeFt)))
                line.addLine(to: CGPoint(x: size.width, y: y(altitudeFt)))
            }
            context.stroke(line, with: .color(.blue), style: StrokeStyle(lineWidth: 2.5, lineJoin: .round))
            // The scale's top and the floor.
            context.draw(Text(Format.altitude(top)).font(.caption2).foregroundStyle(.secondary), at: CGPoint(x: 28, y: 10))
        }
        .background(Color(.secondarySystemBackground))
        .accessibilityLabel("The route from the side: the ground, the airspace and the altitude flown")
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
