import SwiftUI

/// An airplane's squawks: written as they are found, open until fixed. An
/// instrument or equipment that does not work is marked so, with the
/// kinds of flight its 14 CFR 91.213(d) determination covers -- not
/// required for them, removed or deactivated and placarded, no hazard --
/// as the risk assessment reads it.
struct SquawksView: View {
    let aircraft: OwnAircraftRecord
    var onChange: () -> Void
    @State private var squawks: [Squawk]?
    @State private var text = ""
    @State private var foundOn = Date()
    @State private var inoperative = false
    @State private var deferredFor: String?
    @State private var fixing: Squawk?
    @State private var fixNote = ""
    @State private var problem: String?
    @State private var busy = false

    var body: some View {
        List {
            if let squawks {
                let open = squawks.filter { $0.fixedOn == nil }
                Section("Open") {
                    if open.isEmpty { Text("None open").foregroundStyle(.secondary) }
                    ForEach(open) { s in
                        Button {
                            fixing = s
                            fixNote = ""
                        } label: {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(s.text).foregroundStyle(.primary)
                                Text([Day.said(s.reportedOn), Deferral.standing(s)].compactMap { $0 }.joined(separator: " · "))
                                    .font(.footnote).foregroundStyle(s.inoperative && s.deferredFor == nil ? WingtipInk.problem : Color.secondary)
                            }
                        }
                    }
                }
                if let fixing {
                    Section("Fix: \(fixing.text)") {
                        TextField("What was done, and by whom", text: $fixNote, axis: .vertical).lineLimit(2...5)
                        Button("Fixed Today") { Task { await fix(fixing) } }.disabled(busy)
                        Button("Cancel") { self.fixing = nil }
                    }
                }
                // Without a minimum equipment list, inoperative equipment may
                // be deferred for the kinds of flight it is not required for,
                // removed or deactivated and placarded INOPERATIVE, by a pilot
                // or a mechanic who finds it no hazard (14 CFR 91.213(d)).
                Section("Write a Squawk") {
                    TextField("What was found", text: $text, axis: .vertical).lineLimit(1...4)
                    DatePicker("Found on", selection: $foundOn, in: ...Date(), displayedComponents: .date)
                    Toggle("Inoperative equipment", isOn: $inoperative)
                        .onChange(of: inoperative) { _, on in if !on { deferredFor = nil } }
                    if inoperative {
                        Picker("91.213(d)", selection: $deferredFor) {
                            ForEach(Deferral.reaches, id: \.label) { r in Text(r.label).tag(r.value) }
                        }
                    }
                    Button("Write It") { Task { await add() } }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                }
                let fixed = squawks.filter { $0.fixedOn != nil }
                if !fixed.isEmpty {
                    Section("Fixed") {
                        ForEach(fixed) { s in
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(s.text)
                                Text((["Fixed \(Day.said(s.fixedOn ?? ""))"] + [s.fixNote].compactMap { $0 }).joined(separator: " · "))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                        .onDelete { at in
                            let gone = at.map { fixed[$0] }
                            Task {
                                var failed = 0
                                for s in gone {
                                    do { try await Gateway.deleteSquawk(aircraft.id, s.id) } catch { failed += 1 }
                                }
                                await load()
                                if failed > 0 { problem = failed == 1 ? "A squawk couldn't be deleted." : "\(failed) squawks couldn't be deleted." }
                            }
                        }
                    }
                }
            } else if problem == nil {
                ProgressView()
            }
            ProblemLine(problem)
        }
        .navigationTitle("\(aircraft.tailNumber) Squawks")
        .task { await load() }
    }

    private func load() async {
        do { squawks = try await Gateway.squawks(aircraft.id); problem = nil } catch { problem = "The squawks could not be fetched: \(error.localizedDescription)" }
    }

    private func add() async {
        busy = true
        defer { busy = false }
        let request = SquawkRequest(deferredFor: inoperative ? deferredFor : nil, inoperative: inoperative, reportedOn: Day.string(foundOn),
                                    text: text.trimmingCharacters(in: .whitespacesAndNewlines))
        do {
            _ = try await Gateway.addSquawk(aircraft.id, request)
            text = ""; inoperative = false; deferredFor = nil
            await load()
            onChange()
        } catch { problem = error.localizedDescription }
    }

    private func fix(_ s: Squawk) async {
        busy = true
        defer { busy = false }
        var request = s.request
        request.fixedOn = Day.today()
        let note = fixNote.trimmingCharacters(in: .whitespacesAndNewlines)
        request.fixNote = note.isEmpty ? nil : note
        do {
            _ = try await Gateway.updateSquawk(aircraft.id, s.id, request)
            fixing = nil
            await load()
            onChange()
        } catch { problem = error.localizedDescription }
    }
}
