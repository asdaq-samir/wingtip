import SwiftUI

/// "Your First Flight" (FirstFlightModel; the web's FirstFlight card): the
/// first section of the sheet's page with no route, so it rides the
/// sheet's top on Search and on FPL alike, as the web's card rides the
/// sheet: one line of what Wingtip does, the destination with the
/// planner's airport search under it as it is typed, Plan It, and the
/// three steps -- Route, Nav Log, Brief -- with Not Now at the header's
/// right. Planned, it is gone for good and the nav log opens over FPL.
///
/// A List Section, the system's own inset-grouped card, rather than
/// TipKit: a TipView or popover tip holds a title, a message and buttons,
/// never a text field, and Plan It needs the destination typed in place.
struct FirstFlightSection: View {
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(Session.self) private var session
    @FocusState private var focused: Field?
    private var model: FirstFlightModel { .shared }

    enum Field { case dest, from }

    var body: some View {
        @Bindable var model = model
        if model.shown(routed: plan.routed) {
            Section {
                Text("Where to? Wingtip plans from where you are: the route, the checkpoints you'll see from the air, the nav log and a weather brief.")
                    .font(WingtipType.prose)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                field("Destination", prompt: "Airport, town or ident", text: $model.dest, at: .dest)
                    .accessibilityIdentifier("first-flight-dest")
                ForEach(model.destMatches) { match in matchRow(match, isFrom: false) }
                if model.needsFrom {
                    field("From", prompt: "Where you take off", text: $model.from, at: .from)
                        .accessibilityIdentifier("first-flight-from")
                    ForEach(model.fromMatches) { match in matchRow(match, isFrom: true) }
                }
                ProblemLine(model.problem)
                Button {
                    focused = nil
                    Task {
                        await model.planIt(plan: plan, fix: ownShip.fix, home: session.pilot?.homeBase) {
                            // The nav log over FPL, which the route made
                            // turns to (PlanSheet).
                            Navigator.shared.open(.screen(.navlog))
                        }
                    }
                } label: {
                    Text(model.planning ? "Planning…" : "Plan It")
                        .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
                }
                .glassProminentButton()
                .disabled(!model.ready)
                .accessibilityIdentifier("first-flight-plan")
                // The three steps, the first the one this card does.
                (Text("Step 1 of 3 · Route").bold().foregroundStyle(.primary) + Text(" · Nav Log · Brief"))
                    .font(WingtipType.note)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Step 1 of 3, Route; then the nav log and the brief")
            } header: {
                HStack {
                    Label("Your First Flight", systemImage: WingtipIcon.airplane)
                        .font(WingtipType.heading)
                        .foregroundStyle(.primary)
                        .accessibilityAddTraits(.isHeader)
                        // The card's handle on its title: on the Section it
                        // was handed down to every row and button in it,
                        // over their own (Plan It's "first-flight-plan").
                        .accessibilityIdentifier("first-flight")
                    Spacer()
                    Button("Not Now") { focused = nil; model.dismiss() }
                        .font(WingtipType.row)
                        .accessibilityIdentifier("first-flight-close")
                }
                .textCase(nil)
            }
            // Leaving the page puts the keyboard away.
            .onChange(of: Navigator.shared.sheetPage) { _, _ in focused = nil }
        }
    }

    private func field(_ label: String, prompt: String, text: Binding<String>, at: Field) -> some View {
        LabeledContent(label) {
            TextField(label, text: text, prompt: Text(prompt))
                .textInputAutocapitalization(.characters)
                .autocorrectionDisabled()
                .multilineTextAlignment(.trailing)
                .focused($focused, equals: at)
                .submitLabel(.go)
        }
    }

    /// A field the search found: its ident and name, tapped to pick it.
    private func matchRow(_ match: AirportSuggestion, isFrom: Bool) -> some View {
        Button { model.pick(match, from: isFrom) } label: {
            SearchRowLabel(title: match.ident, detail: [match.name, match.municipality].compactMap { $0 }.joined(separator: " · "),
                           systemImage: WingtipIcon.departFrom)
        }
        .foregroundStyle(.primary)
    }
}
