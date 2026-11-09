import SwiftUI

/// The pilot's personal minimums: the weather they will not take off or
/// land in, each a menu, Off until picked (the web's MinimumsPanel). Kept
/// on this phone; the planner says where the briefing is under them.
struct MinimumsView: View {
    @Environment(Verdict.self) private var verdict

    var body: some View {
        Form {
            Section {
                ForEach(PersonalMinimums.Key.allCases) { key in
                    Picker(key.title, selection: Binding(
                        get: { verdict.minimums[key] },
                        set: { verdict.setMinimum(key, $0) }
                    )) {
                        Text("Off").tag(Double?.none)
                        ForEach(key.choices, id: \.self) { value in
                            Text(key.words(value)).tag(Double?.some(value))
                        }
                    }
                    .pickerStyle(.menu)
                }
            }
        }
        .navigationTitle("Personal Minimums")
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The airplane's loading: its own empty weight and arm, each station's
/// pounds and the fuel aboard (the web's Weight & Balance), and the
/// planner's weight and balance for them. Kept on this phone for each
/// airplane; until set, the POH's sample airplane and a pilot.
struct LoadingView: View {
    @Environment(Verdict.self) private var verdict
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    /// The figure's field grows with the type, so a four-figure weight fits.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    var body: some View {
        Form {
            if let loading = verdict.answer?.loading, let load = verdict.load(for: plan.aircraft) ?? verdict.answer?.balance?.load {
                Section(title: "The Airplane") {
                    figure("Empty weight", unit: "lb", value: load.emptyWeightLb) { var l = load; l.emptyWeightLb = $0; save(l) }
                    figure("Empty arm", unit: "in", value: load.emptyArmIn) { var l = load; l.emptyArmIn = $0; save(l) }
                }
                Section(title: "Loaded") {
                    ForEach(Array(loading.stations.enumerated()), id: \.offset) { i, station in
                        figure(station.name, unit: "lb", value: i < load.stationsLb.count ? load.stationsLb[i] : 0,
                               note: station.maxLb.map { "\(Int($0).formatted()) lb at most" }) { value in
                            var l = load
                            l.stationsLb = loading.stations.indices.map { k in k == i ? value : (k < load.stationsLb.count ? load.stationsLb[k] : 0) }
                            save(l)
                        }
                    }
                    figure("Fuel", unit: "gal", value: load.fuelGal, note: "\(loading.fuelMaxGal.formatted()) gal usable") { var l = load; l.fuelGal = $0; save(l) }
                }
                if let balance = verdict.answer?.balance {
                    Section(title: "Balance") {
                        LabeledContent("Takeoff", value: balance.takeoff.words)
                        LabeledContent("Landing", value: balance.landing.words)
                        let problems = balance.problems ?? []
                        if problems.isEmpty {
                            Label("Within the weight and the envelope", systemImage: FindingStyle.symbol("ok"))
                                .foregroundStyle(FindingStyle.colour("ok"))
                        } else {
                            ForEach(problems, id: \.self) { problem in
                                Label(problem, systemImage: FindingStyle.symbol("stop")).foregroundStyle(FindingStyle.colour("stop"))
                            }
                        }
                    }
                }
            } else if verdict.answer != nil {
                Text("The weight and balance is worked out for an airplane whose loading is built in: the Cessna 172S, from its POH.")
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Weight & Balance")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: verdict.key(for: plan)) { await verdict.refresh(plan: plan, signedIn: session.signedIn) }
    }

    private func save(_ load: AirplaneLoad) { verdict.setLoad(load, for: plan.aircraft) }

    /// One figure the pilot types, its unit beside it.
    private func figure(_ title: String, unit: String, value: Double, note: String? = nil, set: @escaping (Double) -> Void) -> some View {
        LabeledContent {
            HStack(spacing: WingtipSpace.xs) {
                TextField(title, value: Binding(get: { value }, set: { set(max(0, $0)) }), format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: fieldWidth)
                Text(unit).foregroundStyle(.secondary)
            }
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}
