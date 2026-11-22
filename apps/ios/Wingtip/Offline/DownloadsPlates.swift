import SwiftUI

/// Downloads' Plates: the FAA's plates kept a state at a time for flying
/// with no signal, as the regions' charts are above. Each state with its
/// size before it is fetched, asked once in a dialog, and the d-TPP cycle
/// they are of with when it ends in the footer; a kept state updates
/// itself then (StatePlates.refreshDue). The kept ones are rows of "On
/// This iPhone" (KeptPlatesRow). The state is DownloadsModel's and
/// StatePlates', the app's (from the environment).
struct PlatesSection: View {
    let model: DownloadsModel
    let search: String
    @Environment(StatePlates.self) private var plates
    @State private var asking: APIPlateStateSet?

    var body: some View {
        let offered = model.plateStates
        Section {
            if let problem = model.platesProblem {
                ProblemLine(problem)
            } else if offered == nil {
                Text("Fetching…").foregroundStyle(.secondary)
            }
            ForEach((offered?.states ?? []).filter { search.isEmpty || $0.name.localizedCaseInsensitiveContains(search) }, id: \.id) { state in
                Button { asking = state } label: {
                    LabeledContent(state.name, value: plates.isKept(state.id) ? "Kept" : KeepPlates.aboutMb(state.bytes))
                }
                .disabled(plates.isKept(state.id) || plates.running.contains(state.id))
                .accessibilityIdentifier("plates-state-\(state.id)")
            }
        } header: {
            Text("Plates")
        } footer: {
            if let cycle = offered?.cycle { Text(Self.footer(cycle: cycle, nextAt: offered?.nextAt)) }
        }
        .confirmationDialog(asking.map { "Download \($0.name)'s plates?" } ?? "",
                            isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
                            titleVisibility: .visible, presenting: asking) { state in
            Button("Download") { model.keepPlates(state.id) }
        } message: { state in
            Text(Self.ask(state, cycle: offered?.cycle))
        }
    }

    /// "1,204 charts at 96 fields, about 410 MB, cycle 2611."
    static func ask(_ state: APIPlateStateSet, cycle: String?) -> String {
        "\(grouped(state.charts)) charts at \(grouped(state.fields)) fields, \(KeepPlates.aboutMb(state.bytes))"
            + (cycle.map { ", cycle \($0)" } ?? "") + ". They download while the app is open."
    }

    /// "Cycle 2611, until 24 Dec 0901Z. A kept state updates itself then."
    static func footer(cycle: String, nextAt: String?) -> String {
        "Cycle \(cycle)\(endsAt(nextAt).map { ", until \($0)" } ?? ""). A kept state updates itself then."
    }

    /// When a cycle ends, as the FAA's schedule says it: "24 Dec 0901Z".
    static func endsAt(_ iso: String?) -> String? {
        guard let iso, let at = ISO8601DateFormatter().date(from: iso) else { return nil }
        return "\(ReadyFacts.dayWords(String(iso.prefix(10)))) \(Format.zulu(at))"
    }

    static func grouped(_ count: Int) -> String { count.formatted(.number.locale(Format.locale)) }
}

/// A state's plates kept: its name and size, its cycle and how far it has
/// come, its failures with Try Again, and its update to the next cycle.
struct KeptPlatesRow: View {
    let kept: KeptPlateState
    let plates: StatePlates

    var body: some View {
        let running = plates.running.contains(kept.id)
        let updating = plates.updating[kept.id]
        let problem = plates.problems[kept.id]
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(kept.name, value: KeepPlates.aboutMb(kept.bytes))
            Text(Self.caption(kept, running: running, updating: updating)).font(.footnote).foregroundStyle(.secondary)
            if kept.unfinished, updating == nil {
                ProgressView(value: Double(kept.done), total: Double(max(1, kept.charts)))
                    .accessibilityLabel("\(kept.name)'s plates")
            }
            ProblemLine(problem)
            if problem != nil || (!running && (kept.unfinished || kept.failed > 0)) {
                Button("Try Again") { plates.start(kept.id, cycle: kept.cycle) }
            }
        }
    }

    /// "Cycle 2611 · 120 of 1,204 charts", "Cycle 2611 · 1,204 charts, 3
    /// not fetched", "Cycle 2611 · updating to 2612…".
    static func caption(_ kept: KeptPlateState, running: Bool, updating: String?) -> String {
        let grouped = PlatesSection.grouped
        if let updating { return "Cycle \(kept.cycle) · updating to \(updating)…" }
        if kept.unfinished { return "Cycle \(kept.cycle) · \(grouped(kept.done)) of \(grouped(kept.charts)) charts\(running ? "" : ", stopped")" }
        return "Cycle \(kept.cycle) · \(grouped(kept.charts)) charts\(kept.failed > 0 ? ", \(grouped(kept.failed)) not fetched" : "")"
    }
}
