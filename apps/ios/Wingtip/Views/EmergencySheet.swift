import MapKit
import SwiftUI

/// The emergency assistant's card, the airplane's own checklist picked
/// for it: opened by its model (Emergency.open, CardTriggers) as every
/// card is, on the card's sheet, the one that opens at full height (the
/// owner, 2026-11-13: "For phones, just do it natively, but stay
/// consistent").
struct EmergencyCard: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        EmergencySheet(airplane: LocalChecklists.airplane(of: plan))
    }
}

/// The emergency assistant, one screen (the web's EmergencySheet), laid
/// out as docs/design/ios.md §8 has it: a card at full height with the
/// card's close at the top right (CardStack; the owner's card rule,
/// 2026-11-10), putting it away as its model's close does (Navigator's
/// left), the map in its top third with the line to the field picked
/// and the glide's reach, then on
/// a solid ground squawk 7700 and Guard as two large tiles, the best
/// fields each with its own Direct To, the airplane's own emergency
/// checklist (or the general guidance, labelled so, with none picked),
/// and the radio. Large type throughout, one column to AX5. Its state is
/// Emergency's; every figure is the engine's.
struct EmergencySheet: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var checklist: ChecklistModel
    /// Counted once as the screen opens, for the one warning haptic.
    @State private var opened = 0

    init(airplane: String) {
        _checklist = State(initialValue: ChecklistModel(airplane: airplane, kind: .emergency))
    }

    @Environment(Emergency.self) private var model
    private var fix: OwnShip.Fix? { dryRun.fix ?? ownShip.fix }
    /// The airplane's profile for its glide, none with none picked (the
    /// web's useEmergency): never a type assumed. An own airplane of no
    /// stock type is "own" here whatever its cruise figures, its glide
    /// ratio alone being what the fields are ranked on.
    private var emergencyAircraft: String? { plan.airplaneChosen ? plan.aircraft : nil }

    var body: some View {
        GeometryReader { screen in
            VStack(spacing: 0) {
                EmergencyMap(fix: fix, picked: model.picked, ring: model.ranked?.glide?.ring ?? [])
                    .frame(height: screen.size.height / 3)
                List {
                    if case .success(let call) = mayday { EmergencyCodeTiles(call: call) }
                    EmergencyFieldsSection(fix: fix, ownShipOff: ownShip.denied) { ident in directTo(ident) }
                    // A Direct To with no connection is not made: said
                    // here, the field's heading and distance still above.
                    if let problem = plan.directProblem { Section { ProblemLine(problem) } }
                    if plan.airplaneChosen {
                        checklistSection
                    } else {
                        guidanceSection(Result { try Emergency.guidance(airplaneChosen: false) ?? [] })
                    }
                    EmergencyRadioSections(mayday: mayday, phoneIdent: model.picked?.ident, phone: model.pickedPhone)
                }
                // Solid grounds read better in a hurry than glass.
                .listStyle(.insetGrouped)
                .font(.title3)
            }
        }
        .navigationTitle("Emergency")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: fix.map { Emergency.key($0, aircraft: emergencyAircraft, glideRatio: plan.figures.glideRatio) }) {
            await model.refresh(fix: fix, aircraft: emergencyAircraft, glideRatio: plan.figures.glideRatio)
        }
        .onChange(of: fix) { _, new in if let new { model.rank(new) } }
        // One warning as it opens, never again while it is up (HIG Haptics).
        .sensoryFeedback(.warning, trigger: opened)
        // The position, asked for now if it never was: the nearest fields
        // and the glide need it.
        .onAppear { opened += 1; ownShip.askLocation() }
    }

    /// Direct To the field, as the radio's and the search's Direct To do
    /// (FieldRunner): on the route from the airplane, else a diversion
    /// from where it is; the field picked for the map's line and the call.
    /// The emergency view stays up, its radio still wanted.
    private func directTo(_ ident: String) {
        model.pickedIdent = ident
        if plan.idents.contains(ident) {
            plan.directTo(ident, from: fix)
        } else if let fix {
            plan.divert(to: ident, from: fix)
        }
    }

    private var sections: [EngineContract.ChecklistSectionsItem] { checklist.checklist.sections }

    /// The engine's pick of the section to open on; a failure is said
    /// over the checklist, which opens on its first section then.
    private var sectionFound: Result<Int?, any Error> { Result { try Emergency.section(sections.map(\.title)) } }

    private var sectionIndex: Int? {
        model.sectionPicked ?? (try? sectionFound.get()) ?? (sections.isEmpty ? nil : 0)
    }

    private var mayday: Result<Emergency.Mayday, any Error> {
        let nature = sectionIndex.map { sections[$0].title } ?? "Engine failure"
        return Result { try model.mayday(fix: fix, tail: plan.tail, nature: nature) }
    }

    /// With no airplane picked, general guidance only (the owner,
    /// 2026-11-09): the engine's emergency_guidance, each item with its
    /// source (AIM 6-1, 6-2, 6-3; FAA-H-8083-3C ch. 18), and the picker for
    /// an airplane -- never an airplane's checklist or figure.
    @ViewBuilder private func guidanceSection(_ items: Result<[EngineContract.EmergencyGuidanceAnswerItemsItem], any Error>) -> some View {
        // Labelled as general: never an airplane's checklist assumed.
        Section("What to Do · General, No Airplane Picked") {
            ForEach(Array(((try? items.get()) ?? []).enumerated()), id: \.offset) { _, item in
                CardRow(title: item.title, detail: "\(item.detail) (\(item.source))")
            }
            // Where the engine could not give it, said here, never an empty list.
            ProblemLine(items, "The general guidance")
            PickAirplaneRow(detail: "Its own emergency checklist and glide")
        }
    }

    /// The airplane's own emergency checklist (Section 3 of its handbook,
    /// as its pilot wrote it), opened at the emergency asked, a menu of
    /// its other sections, each item ticked as it is done. The app writes none.
    @ViewBuilder private var checklistSection: some View {
        if model.sectionPicked == nil, case .failure = sectionFound {
            Section { ProblemLine(sectionFound, "The emergency's section") }
        }
        if let s = sectionIndex, sections.indices.contains(s) {
            Section {
                ForEach(Array(sections[s].items.enumerated()), id: \.offset) { i, item in
                    let on = checklist.isTicked(s, i)
                    Button { checklist.toggle(s, i) } label: {
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
                    Text(sections[s].title)
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
            Section("Checklist") {
                CardRow(title: "No emergency checklist for \(checklist.airplane)",
                        detail: "Write it from the airplane's handbook in its Checklists")
            }
        }
    }
}

#Preview("EmergencySheet") {
    NavigationStack { EmergencySheet(airplane: "N3429J") }
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
