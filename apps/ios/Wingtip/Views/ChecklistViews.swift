import SwiftUI

/// An airplane's checklist, as its pilot writes it from the flight
/// manual and keeps it on this device (LocalChecklists): run, each item
/// ticked as it is done, a section's count by its title -- or written as
/// plain text (ChecklistText). Its state is the model's (ChecklistModel).
struct ChecklistView: View {
    @State private var model: ChecklistModel

    init(airplane: String, kind: ChecklistKind) {
        _model = State(initialValue: ChecklistModel(airplane: airplane, kind: kind))
    }

    var body: some View {
        List {
            if let problem = model.problem {
                Text(problem).foregroundStyle(.orange)
            }
            if let writing = model.writing {
                Section {
                    TextEditor(text: Binding(get: { writing }, set: { model.writing = $0 }))
                        .font(.body.monospaced())
                        .frame(minHeight: 280)
                        .accessibilityLabel(model.title)
                } footer: {
                    Text("# Before takeoff\nFuel selector -- Both\nMixture -- Rich").font(.footnote.monospaced())
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
                                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color.accentColor : Color.secondary)
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
                    if !model.checklist.sections.isEmpty {
                        Button("Start Over") { model.startOver() }.disabled(model.ticked.isEmpty)
                    }
                    Button(model.text.isEmpty ? "Write the \(model.kind.title)" : "Edit the \(model.kind.title)") { model.edit() }
                }
            }
        }
        .navigationTitle(model.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

/// The two rows an airplane's checklists open from, on the Aircraft tab
/// and on one of the pilot's airplanes.
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
    }
}

#Preview("ChecklistView") {
    NavigationStack { ChecklistView(airplane: "N3429J", kind: .normal) }
}
