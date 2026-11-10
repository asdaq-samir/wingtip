import SwiftUI

/// A flight's columns, a part at a time, as a paper logbook has them
/// (with the ones a student's 61.109 experience and instrument currency,
/// 61.57(c), are counted from): the rows of a new flight's form, and of a
/// logged flight opened in its own row of the Logbook.
struct LogbookEntryFields: View {
    enum Part: CaseIterable { case flight, time, landings, distance, instrument, remarks }

    @Binding var entry: LogbookEntryRequest
    let part: Part

    var body: some View {
        switch part {
        case .flight:
            DatePicker("Date", selection: Binding(get: { Day.date(entry.flownOn) ?? Date() }, set: { entry.flownOn = Day.string($0) }),
                       in: ...Date(), displayedComponents: .date)
            words("Route", \.route, placeholder: "KDLH KHIB")
            words("Airplane", \.aircraft, placeholder: "N12345", codes: true)
            words("Type", \.aircraftType, placeholder: "C172", codes: true)
        case .time:
            figure("Total", \.totalHours, unit: "h")
            figure("Night", \.nightHours, unit: "h")
            figure("Cross-country", \.crossCountryHours, unit: "h")
            figure("Dual received", \.dualHours, unit: "h")
            figure("Solo", \.soloHours, unit: "h")
            figure("Sim. instrument", \.instrumentHours, unit: "h")
        case .landings:
            count("Day landings", \.dayLandings)
            count("Night landings", \.nightLandings)
            count("Towered landings", \.toweredLandings)
        case .distance:
            figure("Distance", \.distanceNm, unit: "nm")
            figure("Longest leg", \.longestLegNm, unit: "nm")
        case .instrument:
            count("Approaches", \.approaches)
            Toggle("Holding", isOn: $entry.holding)
            Toggle("Tracking", isOn: $entry.tracking)
        case .remarks:
            TextField("Remarks", text: Binding(get: { entry.remarks ?? "" }, set: { entry.remarks = $0 }), axis: .vertical).lineLimit(1...4)
            // A remark drafted from the entry's own facts, into the field to edit.
            DraftRemarkButton(figures: { RemarkDraft.figures(entry) }) { entry.remarks = $0 }
        }
    }

    private func words(_ title: String, _ key: WritableKeyPath<LogbookEntryRequest, String?>, placeholder: String, codes: Bool = false) -> some View {
        LabeledContent(title) {
            TextField(placeholder, text: Binding(get: { entry[keyPath: key] ?? "" }, set: { entry[keyPath: key] = $0 }))
                .multilineTextAlignment(.trailing)
                .textInputAutocapitalization(codes ? .characters : .sentences)
                .autocorrectionDisabled(codes)
        }
    }

    private func figure(_ title: String, _ key: WritableKeyPath<LogbookEntryRequest, Double>, unit: String) -> some View {
        LabeledContent(title) {
            HStack(spacing: WingtipSpace.xs) {
                TextField("0", value: Binding(get: { entry[keyPath: key] }, set: { entry[keyPath: key] = max(0, $0) }), format: .number)
                    .multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                Text(unit).foregroundStyle(.secondary)
            }
        }
    }

    private func count(_ title: String, _ key: WritableKeyPath<LogbookEntryRequest, Int>) -> some View {
        Stepper(value: Binding(get: { entry[keyPath: key] }, set: { entry[keyPath: key] = max(0, $0) }), in: 0...99) {
            LabeledContent(title, value: "\(entry[keyPath: key])")
        }
    }
}

/// A new flight's form, from the Logbook's plus: the columns in their parts.
struct LogbookEntryForm: View {
    @State var entry: LogbookEntryRequest
    let isNew: Bool
    var save: (LogbookEntryRequest) async throws -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var saving = false
    @State private var problem: String?

    private static let titles: [LogbookEntryFields.Part: String] = [.time: "Time", .landings: "Landings", .distance: "Distance",
                                                                    .instrument: "Instrument", .remarks: "Remarks"]

    var body: some View {
        Form {
            ForEach(LogbookEntryFields.Part.allCases, id: \.self) { part in
                if let title = Self.titles[part] {
                    Section(title: title) { LogbookEntryFields(entry: $entry, part: part) }
                } else {
                    Section { LogbookEntryFields(entry: $entry, part: part) }
                }
            }
            ProblemLine(problem)
        }
        .navigationTitle(isNew ? "Log a Flight" : "The Flight")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    saving = true
                    Task {
                        do { try await save(entry); dismiss() } catch { problem = error.localizedDescription }
                        saving = false
                    }
                }
                .disabled(saving)
            }
        }
    }
}

/// A logged flight opened in its own row of the Logbook: its columns
/// under it, Save and Cancel, and why it was not kept, in place.
struct LogbookEntryEditRows: View {
    @Bindable var model: LogbookEntriesModel
    let saved: () async -> Void

    var body: some View {
        ForEach(LogbookEntryFields.Part.allCases, id: \.self) { part in
            LogbookEntryFields(entry: $model.draft, part: part)
        }
        HStack(spacing: WingtipSpace.md) {
            Button(model.sending ? "Saving…" : "Save") {
                Task { if await model.commitEdit() { await saved() } }
            }
            .fontWeight(.semibold)
            .disabled(model.sending)
            Button("Cancel", role: .cancel) { model.cancelEdit() }
            Spacer(minLength: 0)
        }
        .buttonStyle(.borderless)
        ProblemLine(model.rowProblem)
    }
}

#Preview("LogbookEntryForm") {
    NavigationStack {
        LogbookEntryForm(entry: LogbookEntryRequest(flownOn: "2026-10-28", aircraft: "N3429J", aircraftType: "P28A", route: "KDLH KHIB", totalHours: 1.2, crossCountryHours: 1.2, dayLandings: 2, distanceNm: 62.4, longestLegNm: 62.4),
                         isNew: false) { _ in }
    }
}
