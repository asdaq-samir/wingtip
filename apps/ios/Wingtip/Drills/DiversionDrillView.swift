import SwiftUI

/// The diversion drill (the web app's DiversionDrill, ACS PA.VI.C): where the airplane is, the
/// examiner says divert. The clock starts, the student picks one of the fields round (with their
/// runways, weather and who may land there, and not how far or which way: that is off the chart),
/// estimates the heading, ground speed, time and fuel, and checks them against the planner's exact
/// solution in its forecast air on the way (GET /api/diversion), each estimate marked reasonable or
/// not. The fields are in the engine's order for a diversion (best_fields), so a private or
/// military-only field, landed at only with leave, is never the one a pilot is told was best.
struct DiversionDrillView: View {
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var model = DiversionDrillModel()

    /// The figures a student estimates, by the planner's keys; how far
    /// off is reasonable is the planner's (ALLOWANCES).
    private static let estimates: [(key: String, label: String, unit: String)] = [
        ("mh", "Magnetic heading", "°"), ("gs", "Ground speed", "kt"), ("ete", "Time", "min"), ("fuel", "Fuel", "gal"),
    ]
    private var fix: OwnShip.Fix? { dryRun.fix ?? ownShip.fix }
    private var checked: Bool { model.checked }

    var body: some View {
        List {
            if !plan.airplaneChosen { // No airplane: no speed to work at, and the planner not asked (it answers 422).
                Section { PickAirplaneRow(detail: "Its heading, ground speed, time and fuel are worked at its speed and burn") }
            } else if model.started == nil {
                Section {
                    Text("Where you are\(model.altitudeFt.map { ", at \(Format.altitude($0))" } ?? ""), the examiner says: divert. Pick a field, and work out the magnetic heading, ground speed, time and fuel to it from the chart and the forecast wind.")
                    Picker("Altitude", selection: $model.altitudeFt) {
                        // None until one is picked or there is one to start from.
                        Text("Pick one").tag(Double?.none)
                        ForEach((try? model.altitudes.get()) ?? [], id: \.self) { ft in Text(Format.altitude(ft)).tag(Double?.some(ft)) }
                    }
                    .pickerStyle(.menu)
                    ProblemLine(model.altitudes, "The altitudes")
                    Button { model.start(at: fix, aircraft: plan.plannerAircraft) } label: { Label("Start the Clock", systemImage: "timer") }
                        .disabled(fix == nil || model.altitudeFt == nil)
                    if fix == nil { Text("Waiting for your position").foregroundStyle(.secondary) }
                }
            } else {
                Section {
                    TimelineView(.periodic(from: .now, by: 1)) { context in
                        LabeledContent(checked ? "You took" : "On the clock",
                                       value: stopwatch((model.stopped ?? context.date).timeIntervalSince(model.started ?? context.date)))
                            .monospacedDigit()
                    }
                }
                Section("Divert to") {
                    if model.finding {
                        Text("Finding the fields round you…").foregroundStyle(.secondary)
                    } else if let failed = model.fieldsProblem {
                        ProblemLine(failed)
                    } else if model.fields.isEmpty {
                        Text("No fields near here").foregroundStyle(.secondary)
                    }
                    ForEach(model.fields, id: \.ident) { field in
                        Button { model.chosen = field.ident } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    Text("\(field.ident) · \(field.name)").foregroundStyle(.primary)
                                    let detail = DiversionDrillModel.detail(field)
                                    FieldFlagLine(flag: DiversionDrillModel.flag(field), detail: detail)
                                }
                                Spacer()
                                if model.chosen == field.ident { Image(systemName: "checkmark").foregroundStyle(.tint) }
                            }
                        }
                        .disabled(checked)
                    }
                }
                Section("Your Estimates") {
                    ForEach(Self.estimates, id: \.key) { e in
                        let check = model.answer?.checks.first { $0.key == e.key }
                        LabeledContent {
                            HStack(spacing: WingtipSpace.sm) {
                                if let ok = check?.reasonable { WithinMark(ok: ok) }
                                TextField("", text: Binding(get: { model.typed[e.key] ?? "" }, set: { model.typed[e.key] = $0 }))
                                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing).monospacedDigit()
                                    .frame(width: 72).disabled(checked)
                                Text(e.unit).foregroundStyle(.secondary).frame(width: 30, alignment: .leading)
                            }
                        } label: {
                            Text(e.label)
                            if check?.reasonable == false, let written = check?.written { Text("Not quite: \(written)") }
                        }
                    }
                }
                if checked, let answer = model.answer {
                    if let line = answer.problem {
                        Text(line).foregroundStyle(WingtipInk.problem)
                    } else {
                        Section("To \(answer.to), Worked Out") {
                            ForEach(answer.steps, id: \.name) { step in LabeledContent(step.name, value: step.value).monospacedDigit() }
                        }
                    }
                    if let best = model.fields.first, best.ident != answer.to {
                        Text("Ranked first for a diversion: \(best.ident), \(Int(best.distanceNm.rounded())) nm. Was \(answer.to) the better choice?")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }
                ProblemLine(model.problem)
                Section {
                    if checked {
                        Button("Again") { model.start(at: fix, aircraft: plan.plannerAircraft) }
                    } else {
                        Button(model.checking ? "Checking…" : "Check") { model.check(aircraft: plan.plannerAircraft, figures: plan.figures) }
                            .disabled(model.chosen == nil || model.checking)
                    }
                }
            }
        }
        .navigationTitle("Diversion Drill")
        .onAppear { model.startingAltitude(planFt: plan.altitudeFt, fix: fix) }
    }

    /// Minutes and seconds, as a stopwatch shows them: "2:07".
    private func stopwatch(_ seconds: TimeInterval) -> String {
        let s = max(0, Int(seconds))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

#Preview("DiversionDrillView") {
    NavigationStack { DiversionDrillView() }
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
