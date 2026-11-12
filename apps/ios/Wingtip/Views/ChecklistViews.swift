import SwiftUI

/// An airplane's checklist, as its pilot writes it from the flight
/// manual and keeps it on this device (LocalChecklists): run, each item
/// ticked as it is done, a section's count by its title -- or written as
/// plain text (ChecklistText). Its state is the model's (ChecklistModel).
struct ChecklistView: View {
    @Environment(Emergency.self) private var emergency
    @Environment(\.lookAccent) private var accent
    @State private var model: ChecklistModel

    init(airplane: String, kind: ChecklistKind) {
        _model = State(initialValue: ChecklistModel(airplane: airplane, kind: kind))
    }

    var body: some View {
        List {
            if let problem = model.problem {
                ProblemLine(problem)
            }
            if let writing = model.writing {
                Section {
                    TextEditor(text: Binding(get: { writing }, set: { model.writing = $0 }))
                        .font(.body.monospaced())
                        .frame(minHeight: 280)
                        .accessibilityLabel(model.title)
                }
                Section {
                    // The phases' headings only, to write the airplane's own
                    // items under from its flight manual (ChecklistPhases).
                    if writing.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Button("Start from the Phases") { model.startFromPhases() }
                    }
                    Button("Save \(model.kind.title)") { model.save() }
                    Button("Cancel") { model.cancel() }
                }
            } else {
                if model.checklist.sections.isEmpty {
                    Text(model.text.isEmpty ? "Nothing written yet" : "No items under the headings yet").foregroundStyle(.secondary)
                }
                ForEach(Array(model.checklist.sections.enumerated()), id: \.offset) { s, section in
                    Section {
                        ForEach(Array(section.items.enumerated()), id: \.offset) { i, item in
                            let on = model.isTicked(s, i)
                            Button {
                                model.toggle(s, i)
                            } label: {
                                HStack {
                                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? accent : Color.secondary).symbolSwap()
                                    Text(item.challenge).foregroundStyle(on ? .secondary : .primary)
                                    Spacer()
                                    if let response = item.response { Text(response).foregroundStyle(.secondary) }
                                }
                            }
                            .accessibilityAddTraits(on ? .isSelected : [])
                        }
                    } header: {
                        HStack {
                            Text(section.title)
                            Spacer()
                            Text("\(model.done(in: s)) of \(section.items.count)").monospacedDigit()
                        }
                    }
                }
                Section {
                    // The emergency checklist's way to the assistant: the
                    // best fields, this list at the emergency, the MAYDAY.
                    if model.kind == .emergency {
                        Button("Emergency Assistant", systemImage: "exclamationmark.triangle.fill") { emergency.open = .checklist }
                            .foregroundStyle(WingtipInk.problem)
                    }
                    if !model.checklist.sections.isEmpty {
                        Button("Start Over") { model.startOver() }.disabled(model.ticked.isEmpty)
                    }
                    Button(model.text.isEmpty ? "Write the \(model.kind.title)" : "Edit the \(model.kind.title)") { model.edit() }
                }
            }
        }
        .navigationTitle(model.title)
    }
}

/// The rows an airplane's checklists open from, on the Aircraft tab, on
/// one of the pilot's airplanes and on Setup's Checklists: the two lists,
/// and the emergency assistant beside them (2 taps from the map on the
/// ground, docs/navigation.md's gap 1).
struct ChecklistRows: View {
    let airplane: String

    var body: some View {
        NavigationLink {
            ChecklistView(airplane: airplane, kind: .normal)
        } label: {
            Label("Checklist", systemImage: "checklist")
        }
        NavigationLink {
            ChecklistView(airplane: airplane, kind: .emergency)
        } label: {
            Label("Emergency", systemImage: "exclamationmark.triangle")
        }
        EmergencyAssistantRow()
    }
}

/// The emergency assistant opened by its name (RootView.openScreen), as a
/// link's `open=emergency` opens it: the best fields, the checklist, the MAYDAY.
struct EmergencyAssistantRow: View {
    @Environment(\.appCommand) private var appCommand
    var body: some View {
        Button { appCommand(.open(.emergency)) } label: {
            Label(Screen.emergency.title, systemImage: "exclamationmark.triangle.fill")
        }
        .foregroundStyle(WingtipInk.problem)
    }
}

/// Setup's Checklists: the picked airplane's checklists, as the Airplane
/// tab lists them, one row from Setup.
struct ChecklistsPage: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        List {
            Section(plan.airplaneName ?? "No Airplane Picked") {
                ChecklistRows(airplane: LocalChecklists.airplane(of: plan))
            }
        }
        .navigationTitle(Screen.checklists.title)
    }
}

#Preview("ChecklistView") {
    NavigationStack { ChecklistView(airplane: "N3429J", kind: .normal) }
}
