import SwiftUI

/// The one inline ask, wherever a figure is needed and the airplane lacks
/// an input to it (the owner, 2026-11-09: "just ask for it at the time
/// it's needed"): "How much fuel does N123AB use to start and taxi?" with
/// its field, Save, Not Now and Edit N123AB, which opens the airplane's
/// profile at that figure; closing it comes back here. A handbook table
/// (the loading, a takeoff or landing chart) is a link to the profile
/// alone. With no airplane picked, the existing picker (PickAirplaneRow).
/// Nothing shows where nothing is missing. Its state is AskFigureModel's.
struct AskFigureRow: View {
    /// The screen's figures, first missing input first.
    let needs: [AirplaneNeed]
    /// What an airplane would give here, under the picker's title.
    var pickDetail = "Its figures are worked out from its own handbook"
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @State private var model = AskFigureModel()
    @State private var editing: ProfileAsk?
    @FocusState private var typing: Bool

    var body: some View {
        Group {
            switch model.ask(needs, plan: plan) {
            case .pick?: PickAirplaneRow(detail: pickDetail)
            case .figure(let figure)?: ask(figure)
            case .table(let table)?: tableLink(table)
            case nil: EmptyView()
            }
        }
        .airplaneProfile($editing)
    }

    private var name: String { AskFigureModel.airplane(plan) }

    private func ask(_ figure: OwnFigure) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text(figure.question(name)).font(WingtipType.row)
            HStack(spacing: WingtipSpace.sm) {
                TextField(figure.label, text: $model.text)
                    .keyboardType(.decimalPad).textFieldStyle(.roundedBorder).focused($typing)
                    .submitLabel(.done)
                    .onSubmit { Task { await model.save(figure, plan: plan, signedIn: session.signedIn) } }
                    .accessibilityLabel(figure.label)
                Text(figure.unit).foregroundStyle(.secondary).accessibilityHidden(true)
            }
            HStack(spacing: WingtipSpace.lg) {
                Button(model.saving ? "Saving…" : "Save") {
                    typing = false
                    Task { await model.save(figure, plan: plan, signedIn: session.signedIn) }
                }
                .disabled(model.saving || AskFigureModel.number(model.text) == nil)
                Button("Not Now") { typing = false; model.putOff(figure.rawValue, plan: plan) }
                if let tail = plan.tail {
                    Button("Edit \(tail)") { editing = ProfileAsk(tail: tail, focus: figure) }
                }
            }
            // Each its own tap in the row, the tint's blue; a 44-point area
            // round the words without the buttons growing (HIG).
            .buttonStyle(.borderless)
            .contentShape(Rectangle().inset(by: -WingtipSpace.sm))
            if let note = model.note { Text(note).font(WingtipType.note).foregroundStyle(.secondary) }
            ProblemLine(model.problem)
        }
        .padding(.vertical, WingtipSpace.xs)
    }

    /// A handbook's table, which the profile's page takes from its photo.
    @ViewBuilder private func tableLink(_ table: String) -> some View {
        let what = table == "loading" ? "loading and envelope" : "\(table) chart"
        if let tail = plan.tail {
            Button { editing = ProfileAsk(tail: tail, focus: nil) } label: {
                CardRow(title: "Add \(tail)'s \(what)", detail: "From its handbook, in its profile") {
                    Image(systemName: "chevron.right").foregroundStyle(.tertiary).accessibilityHidden(true)
                }
            }
            .swipeActions { Button("Not Now") { model.putOff(table, plan: plan) } }
        } else {
            CardRow(title: "\(name.capitalized)'s \(what) isn't given", detail: "Pick the airplane by its N-number to add it") { EmptyView() }
        }
    }
}

#Preview("AskFigureRow") {
    let plan = Plan()
    plan.tail = "N123AB"
    plan.aircraft = Plan.ownAirplane
    return List { AskFigureRow(needs: [.fuelTotals]) }
        .environment(plan)
        .environment(Session())
}
