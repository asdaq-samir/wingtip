import SwiftUI

/// Setup → Downloads: the chart of a sectional sheet's coverage, a state
/// or a box on the map kept on the phone for flying with no signal, as
/// ForeFlight's and Garmin Pilot's downloads are. Pick the kinds and the
/// density, see each region's size before it is fetched, follow it in the
/// background, see the storage it takes, delete it, and update it when
/// the FAA's next cycle is out. The state is DownloadsModel's.
struct DownloadsView: View {
    @State private var model = DownloadsModel()
    @State private var asking: APIOfflineRegion?
    @State private var search = ""
    private let progress = OfflineProgress.shared

    var body: some View {
        List {
            keptSection
            Section("Charts") {
                ForEach(DownloadsModel.kinds, id: \.key) { kind in
                    Toggle(kind.label, isOn: Binding(get: { model.picked.contains(kind.key) },
                                                     set: { on in if on { model.picked.insert(kind.key) } else { model.picked.remove(kind.key) } }))
                }
                // A discrete setting of two, so a segmented control
                // (docs/decisions/0017).
                Picker("Detail", selection: $model.scale) {
                    Text("Sharp").tag(2)
                    Text("Smaller").tag(1)
                }
                .pickerStyle(.segmented)
                NavigationLink("Pick on the Map") { DownloadsMapView(model: model) }
            }
            regionSection("Sectional Sheets", group: "sheet")
            regionSection("States", group: "state")
            ProblemLine(model.problem)
        }
        .navigationTitle("Downloads")
        .searchable(text: $search, prompt: "Sheet or State")
        .task { await model.load() }
        .onChange(of: progress.landed) { model.refresh() }
        .confirmationDialog(asking.map { "Download \($0.name)?" } ?? "", isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
                            titleVisibility: .visible, presenting: asking) { region in
            Button("Download \(Self.size(model.size(of: region)))") { Task { await model.download(region.id) } }
        } message: { _ in
            Text("Downloads in the background, over Wi-Fi or cellular.")
        }
    }

    @ViewBuilder private var keptSection: some View {
        Section("On This iPhone") {
            ForEach(model.kept) { kept in
                OfflineKeptRow(kept: kept, written: progress.written(kept), updatable: model.updatable(kept),
                               newest: model.newestCycle, update: { Task { await model.update(kept) } },
                               retry: { Task { await model.keep(kept, cycle: kept.cycle) } })
                    .swipeActions { Button("Delete", role: .destructive) { model.delete(kept) } }
            }
            LabeledContent("Storage Used", value: ByteCountFormatter.string(fromByteCount: model.storageUsed, countStyle: .file))
            if let free = model.storageFree {
                LabeledContent("Free on iPhone", value: ByteCountFormatter.string(fromByteCount: free, countStyle: .file))
            }
        }
    }

    private func regionSection(_ title: String, group: String) -> some View {
        Section(title) {
            ForEach(model.regions.filter { $0.group == group && (search.isEmpty || $0.name.localizedCaseInsensitiveContains(search)) }, id: \.id) { region in
                Button { asking = region } label: {
                    LabeledContent(region.name, value: model.busy.contains(region.id) ? "Asking…" : Self.size(model.size(of: region)))
                }
                .disabled(model.archives.isEmpty || model.busy.contains(region.id))
            }
        }
    }

    static func size(_ bytes: Int?) -> String {
        bytes.map { ByteCountFormatter.string(fromByteCount: Int64($0), countStyle: .file) } ?? "Sizing…"
    }
}

/// A region kept: its name and cycle, its progress while it comes, and
/// the cycle's expiry or the update to the next one.
private struct OfflineKeptRow: View {
    let kept: OfflineKept
    let written: Int64
    let updatable: Bool
    let newest: String?
    let update: () -> Void
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(kept.name, value: ByteCountFormatter.string(fromByteCount: Int64(kept.bytes), countStyle: .file))
            Text(caption).font(.footnote).foregroundStyle(kept.expired() ? WingtipInk.caution : .secondary)
            if !kept.complete, kept.failed == nil {
                let doneBytes = kept.done.reduce(0) { $0 + (kept.wanted[$1] ?? 0) }
                ProgressView(value: Double(Int64(doneBytes) + written), total: Double(max(1, kept.bytes)))
            }
            if let failed = kept.failed {
                ProblemLine("Stopped: \(failed)")
                Button("Try Again", action: retry)
            }
            if updatable, let newest { Button("Update to \(newest)", action: update) }
        }
    }

    private var caption: String {
        let names = kept.wanted.keys.sorted().map { $0.replacingOccurrences(of: "_", with: " ").uppercased() }.joined(separator: ", ")
        if kept.expired() { return "Edition \(kept.cycle), expired \(kept.expires ?? "") · \(names)" }
        return "Edition \(kept.cycle)\(kept.expires.map { ", until \($0)" } ?? "") · \(names)"
    }
}

#Preview("DownloadsView") {
    NavigationStack { DownloadsView() }
}
