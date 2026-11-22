import SwiftUI

/// Weight & Balance, on the iPhone and the iPad alike: the airplane's own
/// empty weight and arm, each station's pounds and the fuel aboard (the
/// web's Weight & Balance), weighed on the device as they are typed
/// (LoadingModel) and drawn on the POH's envelope (EnvelopeChart). Kept on
/// this device for each airplane; until set, the POH's sample airplane and
/// a pilot. No airplane is assumed: with none picked, or one without its
/// loading, empty weight or moment, each is asked for in place (the owner,
/// 2026-11-09; FAA-H-8083-1B).
struct LoadingView: View {
    @Environment(Verdict.self) private var verdict
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @State private var model = LoadingModel()
    /// The fuel's grade picked for the airplane (LoadingModel.grade).
    @State private var grade: String?
    /// The figure's field grows with the type, so a four-figure weight fits.
    @ScaledMetric(relativeTo: .body) private var fieldWidth = 96.0

    var body: some View {
        Form {
            if let loading = verdict.answer?.loading, let load = verdict.load(for: plan.loadKey) ?? verdict.answer?.balance?.load {
                stations(loading, load)
                balance(loading)
                    .task(id: weighed(load)) {
                        model.weigh(loading, load: load, tripFuelGal: plan.totals?.fuelGal, lbPerGal: model.lbPerGal(grade))
                    }
            } else if !plan.airplaneChosen || verdict.answer != nil {
                AskFigureRow(needs: [.weightBalance], pickDetail: "Its weight and balance is worked out from its POH's loading")
            } else {
                ProgressView()
            }
        }
        .navigationTitle("Weight & Balance")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { grade = model.grade(for: plan.loadKey) }
        .task(id: verdict.key(for: plan)) { await verdict.refresh(plan: plan, signedIn: session.signedIn) }
    }

    /// What is weighed: every figure of the load and the trip's fuel, so a
    /// change of any weighs it again.
    private func weighed(_ load: AirplaneLoad) -> [Double] {
        [load.emptyWeightLb, load.emptyArmIn, load.fuelGal, plan.totals?.fuelGal ?? -1, model.lbPerGal(grade) ?? -1] + load.stationsLb
    }

    @ViewBuilder
    private func stations(_ loading: PohLoading, _ load: AirplaneLoad) -> some View {
        Section("The Airplane") {
            figure("Empty weight", unit: "lb", value: load.emptyWeightLb) { var l = load; l.emptyWeightLb = $0; save(l) }
            figure("Empty arm", unit: "in", value: load.emptyArmIn) { var l = load; l.emptyArmIn = $0; save(l) }
        }
        Section("Loaded") {
            ForEach(Array(loading.stations.enumerated()), id: \.offset) { i, station in
                figure(station.name, unit: "lb", value: i < load.stationsLb.count ? load.stationsLb[i] : 0,
                       note: station.maxLb.map { "\(Int($0).formatted()) lb at most · \(Format.number(station.armIn, decimals: 1)) in" }
                           ?? "\(Format.number(station.armIn, decimals: 1)) in") { value in
                    var l = load
                    l.stationsLb = loading.stations.indices.map { k in k == i ? value : (k < load.stationsLb.count ? load.stationsLb[k] : 0) }
                    save(l)
                }
            }
            figure("Fuel", unit: "gal", value: load.fuelGal,
                   note: "\(loading.fuelMaxGal.formatted()) gal usable · \(Format.number(loading.fuelArmIn, decimals: 1)) in") { value in
                var l = load; l.fuelGal = value; save(l)
            }
            // The fuel by its grade, its weight a gallon the engine's; the
            // POH's own figure until one is picked.
            Picker("Fuel grade", selection: Binding(get: { grade }, set: { grade = $0; model.setGrade($0, for: plan.loadKey) })) {
                Text("As the POH says").tag(String?.none)
                ForEach(model.grades, id: \.grade) { g in
                    Text("\(g.name) · \(Format.number(g.lbPerGal, decimals: 1)) lb/gal").tag(String?.some(g.grade))
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("fuel-grade")
        }
    }

    @ViewBuilder
    private func balance(_ loading: PohLoading) -> some View {
        Section("Balance") {
            if let balance = model.balance {
                let points = LoadingModel.loaded(balance)
                EnvelopeChart(outline: LoadingModel.outline(loading), takeoff: points.takeoff, landing: points.landing,
                              within: balance.problems.isEmpty)
                    .padding(.vertical, WingtipSpace.sm)
                LabeledContent("Takeoff", value: words(balance.takeoff.weightLb, balance.takeoff.armIn))
                LabeledContent("Landing", value: words(balance.landing.weightLb, balance.landing.armIn))
                if balance.problems.isEmpty {
                    Label("Within the weight and the envelope", systemImage: FindingStyle.symbol("ok"))
                        .foregroundStyle(FindingStyle.colour("ok"))
                } else {
                    ForEach(balance.problems, id: \.self) { problem in
                        Label(problem, systemImage: FindingStyle.symbol("stop")).foregroundStyle(FindingStyle.colour("stop"))
                    }
                }
            } else if let problem = model.problem {
                ProblemLine(problem)
            }
        }
    }

    /// "2,407 lb · 41.2 in", as the web's Balance rows; "no CG" at zero weight.
    private func words(_ weight: Double, _ arm: Double?) -> String {
        "\(Format.grouped(weight)) lb · \(arm.map { "\(Format.number($0, decimals: 1)) in" } ?? "no CG")"
    }

    private func save(_ load: AirplaneLoad) { verdict.setLoad(load, for: plan.loadKey) }

    /// One figure the pilot types, its unit beside it.
    private func figure(_ title: String, unit: String, value: Double, note: String? = nil, set: @escaping (Double) -> Void) -> some View {
        LabeledContent {
            HStack(spacing: WingtipSpace.xs) {
                TextField(title, value: Binding(get: { value }, set: { set(max(0, $0)) }), format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).frame(maxWidth: fieldWidth)
                Text(unit).foregroundStyle(.secondary)
            }
        } label: {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(title)
                if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
            }
        }
    }
}
