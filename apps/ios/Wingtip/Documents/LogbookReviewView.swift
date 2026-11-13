import SwiftUI

/// The logbook's "Add from a Photo" (LogbookView's File section): the
/// camera, the spinner while the page is read, the problem where it
/// failed, and the review; `onLogged` fetches the logbook again.
struct LogbookPhotoRow: View {
    var onLogged: () async -> Void
    @State private var model = LogbookPhotoModel()
    @State private var photographing = false

    var body: some View {
        Group {
            if DocumentReader.offered {
                Button { photographing = true } label: { Label("Add from a Photo", systemImage: "doc.viewfinder") }
                    .disabled(model.reader.reading)
            }
            if model.reader.reading { ReadingRow() }
            ProblemLine(model.reader.problem)
        }
        .documentPhoto(isPresented: $photographing, onImage: { model.read($0) }, onProblem: { model.reader.problem = $0 })
        .sheet(isPresented: $model.reviewing) {
            NavigationStack { LogbookReviewView(model: model, onLogged: onLogged) }
        }
    }
}

/// A row for each flight on the page, as the logbook lists one, with the
/// engine's flags under it; the page's own flags (its totals against its
/// rows) at the top. A row with no date read cannot be confirmed.
struct LogbookReviewView: View {
    @Bindable var model: LogbookPhotoModel
    var onLogged: () async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let count = model.toLog.count
        List {
            let pageFlags = model.check?.flags ?? []
            if let read = model.notes, read.unreadable != nil || !(read.notes ?? []).isEmpty || !pageFlags.isEmpty {
                Section("This Page") {
                    DocumentNotes(read: read)
                    ForEach(Array(pageFlags.enumerated()), id: \.offset) { _, flag in FlagLine(flag: flag) }
                }
            }
            if let problem = model.problem { Section { ProblemLine(problem) } }
            Section("Flights") {
                if model.rows.isEmpty { Text("No flights were read on this page.").foregroundStyle(.secondary) }
                ForEach(Array(model.rows.enumerated()), id: \.offset) { i, row in
                    rowView(i, row)
                }
            }
        }
        .navigationTitle("Logbook Page")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { model.close() } }
            ToolbarItem(placement: .confirmationAction) {
                Button(model.saving ? "Logging…" : "Log \(count) Flight\(count == 1 ? "" : "s")") { Task { await log() } }
                    .disabled(count == 0 || model.saving)
            }
        }
    }

    @ViewBuilder private func rowView(_ i: Int, _ row: LogbookRowCheck) -> some View {
        let e = row.entry
        let landings = Int(e.dayLandings + e.nightLandings)
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Toggle(isOn: Binding(get: { model.isConfirmed(i) }, set: { model.setConfirmed(i, $0) })) {
                Text((e.flownOn.map(Day.said) ?? "No date read") + (e.route.map { " · \($0)" } ?? ""))
                Text([e.aircraft, e.aircraftType, Format.hours(e.totalHours), "\(landings) landing\(landings == 1 ? "" : "s")"]
                    .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
            }
            .disabled(!LogbookPhotoModel.canConfirm(row) || model.logged.contains(i))
            if model.logged.contains(i) {
                Label("Logged", systemImage: "checkmark.circle.fill").font(WingtipType.note).foregroundStyle(WingtipInk.go)
            }
            ForEach(Array(row.flags.enumerated()), id: \.offset) { _, flag in FlagLine(flag: flag) }
        }
    }

    private func log() async {
        let done = await model.logConfirmed { try await Gateway.addLogbookEntry($0) }
        await onLogged()
        if done {
            model.close()
            dismiss()
        }
    }
}
