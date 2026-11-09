import SwiftUI

/// The emergency assistant, one screen (the web's EmergencySheet): the
/// best fields within a glide with the line to the one picked on the map,
/// the airplane's own emergency checklist, and the radio -- squawk 7700,
/// the frequencies to try and the MAYDAY filled in -- with the field's
/// phone and 911. A system sheet over the map, which stays in sight
/// above it. Its state is Emergency's.
struct EmergencySheet: View {
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var checklist: ChecklistModel

    init(airplane: String) {
        _checklist = State(initialValue: ChecklistModel(airplane: airplane, kind: .emergency))
    }

    private var model: Emergency { .shared }
    private var fix: OwnShip.Fix? { dryRun.fix ?? ownShip.fix }
    /// The airplane's profile for its glide, none with none picked (the
    /// web's useEmergency): never a type assumed.
    private var emergencyAircraft: String? { plan.airplaneChosen ? plan.aircraft : nil }

    var body: some View {
        NavigationStack {
            List {
                EmergencyFieldsSection(fix: fix, ownShipOff: ownShip.denied)
                checklistSection
                EmergencyRadioSections(mayday: mayday, phoneIdent: model.picked?.ident, phone: model.pickedPhone)
            }
            .navigationTitle("Emergency")
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { model.close() }
            .task(id: fix.map { Emergency.key($0, aircraft: emergencyAircraft) }) { await model.refresh(fix: fix, aircraft: emergencyAircraft) }
            .onChange(of: fix) { _, new in if let new { model.rank(new) } }
        }
    }

    private var sections: [EngineContract.ChecklistSectionsItem] { checklist.checklist.sections }

    private var sectionIndex: Int? {
        model.sectionPicked ?? Emergency.section(sections.map(\.title)) ?? (sections.isEmpty ? nil : 0)
    }

    private var mayday: Result<Emergency.Mayday, any Error> {
        let nature = sectionIndex.map { sections[$0].title } ?? "Engine failure"
        return Result { try model.mayday(fix: fix, tail: plan.tail, nature: nature) }
    }

    /// The airplane's own emergency checklist (Section 3 of its handbook,
    /// as its pilot wrote it), opened at the emergency asked, a menu of
    /// its other sections, each item ticked as it is done. The app writes none.
    @ViewBuilder private var checklistSection: some View {
        if let s = sectionIndex, sections.indices.contains(s) {
            Section {
                ForEach(Array(sections[s].items.enumerated()), id: \.offset) { i, item in
                    let on = checklist.isTicked(s, i)
                    Button { checklist.toggle(s, i) } label: {
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
                    SectionTitle(sections[s].title)
                    Spacer()
                    Menu {
                        Picker("Emergency", selection: Binding(get: { s }, set: { model.sectionPicked = $0; checklist.startOver() })) {
                            ForEach(Array(sections.enumerated()), id: \.offset) { i, section in Text(section.title).tag(i) }
                        }
                    } label: {
                        Label("Other", systemImage: "chevron.down").labelStyle(.titleAndIcon)
                    }
                    .textCase(nil)
                }
            }
        } else {
            Section(title: "Checklist") {
                CardRow(title: "No emergency checklist for \(checklist.airplane)",
                        detail: "Write it from the airplane's handbook in its Checklists")
            }
        }
    }
}

#Preview("EmergencySheet") {
    EmergencySheet(airplane: "N3429J")
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
