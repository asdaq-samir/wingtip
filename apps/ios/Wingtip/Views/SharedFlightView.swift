import SwiftUI

/// A flight another pilot sent, previewed (SharedFlightModel): its route,
/// altitude, departure time, airplane type and rules, and a saved flight's
/// nav log as filed; Use This Plan or Not Now.
struct SharedFlightView: View {
    @Environment(\.appCommand) private var appCommand
    @Environment(Plan.self) private var route
    let model: SharedFlightModel

    var body: some View {
        List {
            if model.gone {
                ContentUnavailableView("This flight is no longer shared.", systemImage: "link",
                                       description: Text("Its pilot stopped sharing it."))
            } else if let plan = model.plan {
                Section { planRows(plan) }
                if let totals = model.totals {
                    Section("Totals") {
                        LabeledContent("Distance", value: Format.distance(totals.distanceNm))
                        LabeledContent("Time En Route", value: totals.eteMin.map(Format.duration) ?? "—")
                        LabeledContent("Fuel", value: Format.fuel(totals.fuelGal))
                    }
                }
                if !model.navLog.isEmpty {
                    Section("Nav Log") { ForEach(model.navLog, id: \.sequenceNo) { SharedNavLogRow(point: $0) } }
                }
            } else if model.loading {
                ProgressView().frame(maxWidth: .infinity)
            }
            ProblemLine(model.problem)
        }
        .navigationTitle("Shared Flight")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(model.gone ? "Close" : "Not Now") { model.notNow() }
            }
            if !model.gone {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Use This Plan") { if let command = model.use(on: route) { appCommand(command, then: .navlog) } }.disabled(model.plan == nil)
                }
            }
        }
        .task(id: model.link) { await model.load() }
    }

    @ViewBuilder private func planRows(_ plan: SharedPlan) -> some View {
        LabeledContent("Route", value: plan.route)
        LabeledContent("Altitude", value: plan.altitudeFt.map { Format.altitude(Double($0)) } ?? "Planner's pick")
        LabeledContent("Departure", value: plan.depart.map { "\(Format.time($0)) (\(Format.zulu($0)))" } ?? "About now")
        if let type = plan.type { LabeledContent("Airplane Type", value: type) }
        if let rules = plan.rules { LabeledContent("Flight Rules", value: rules.label) }
        if let tail = plan.tail { LabeledContent("N-Number", value: tail) }
        // The sender's airplane is said, never flown: the pilot's own is.
        LabeledContent("Planned With", value: route.tail ?? "Your airplane")
    }
}

/// One line of a shared nav log: the point, and the leg to it as a paper
/// nav log has it -- magnetic heading, ground speed, time and fuel.
private struct SharedNavLogRow: View {
    let point: GWFlightCheckpointDto

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text(point.name).font(.body)
            Text([point.magneticHeadingDeg.map { "MH \(Format.heading($0))" },
                  point.groundspeedKt.map { "GS \(Format.speed($0))" },
                  point.eteMin.map(Format.navLogTime),
                  point.fuelGal.map { Format.fuel($0) }].compactMap { $0 }.joined(separator: "  "))
                .font(.footnote.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }
}
