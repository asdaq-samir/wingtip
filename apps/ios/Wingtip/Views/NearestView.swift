import SwiftUI

/// Nearest, the one list wherever it is opened from (the owner's card
/// rule, 2026-11-10: "Nearest is one list"): the search's All Nearest, the
/// instruments bar, the plan's In Flight row, a link and Siri. The fields
/// nearest the airplane (the dry run's airplane while it flies), with the
/// planner's distance and bearing to each; a row opens the field's card in
/// this card's stack, and Divert, a swipe or a hold away, plans the route
/// from here to it -- its heading, time and fuel the planner's, as any
/// route's are -- with the route as it was kept for Cancel.
struct NearestView: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var fields: [NearestAirport] = []
    @State private var problem: String?
    @State private var from: Planner.FieldsFrom = .planner
    /// Set once the GPS has given nothing for EmergencyFieldsSection.waitS.
    @State private var noFixYet = false

    private var fix: OwnShip.Fix? { dryRun.fix ?? ownShip.fix }

    var body: some View {
        List {
            if fix == nil {
                noPosition
            }
            if from == .device, !fields.isEmpty {
                // The packs hold no weather or runways: said over the list.
                CardRow(title: "From this iPhone, without weather", detail: "The planner can't be reached: the fields are the chart data kept here, nearest first")
            }
            Section(fields.isEmpty ? "" : "Nearest to you") {
                ForEach(fields) { field in
                    NavigationLink(value: SheetPage.airport(field.ident)) { NearestRow(field: field) }

                        .siriSees(SiriSaw.airport(field.ident))
                        .swipeActions(edge: .leading) {
                            Button("Divert") { divert(field.ident) }.tint(WingtipInk.caution)
                        }
                        .contextMenu {
                            Button { divert(field.ident) } label: { Label("Divert to \(field.ident)", systemImage: "arrow.uturn.right") }
                        }
                }
            }
            ProblemLine(problem)
            // The checkride's diversion from here, worked by the planner.
            Section {
                NavigationLink { DiversionDrillView() } label: { Label("Diversion Drill", systemImage: "timer") }
            }
        }
        .navigationTitle("Nearest")
        // Nearest needs the position: asked for here the first time.
        .onAppear { ownShip.askLocation() }
        .task(id: fix.map { "\(($0.coordinate.latitude * 60).rounded()),\(($0.coordinate.longitude * 60).rounded())" }) {
            guard let at = fix?.coordinate else { return }
            do {
                (fields, from) = try await Planner.nearestOrPacks(lat: at.latitude, lon: at.longitude)
                problem = nil
            } catch {
                guard !Task.isCancelled else { return }
                problem = "The nearest fields could not be found: the planner didn't answer and no chart data is kept on this iPhone here."
            }
        }
    }

    /// With no fix: the position off, being found, or not found after a
    /// while, each saying what to do, never "Finding" forever.
    @ViewBuilder private var noPosition: some View {
        if ownShip.denied {
            ContentUnavailableView {
                Label("Location Is Off", systemImage: "location.slash")
            } description: {
                Text("Nearest is from where the airplane is.")
            } actions: {
                if let settings = URL(string: UIApplication.openSettingsURLString) { Link("Turn On Location in Settings", destination: settings) }
            }
        } else if noFixYet {
            ContentUnavailableView("No GPS Position", systemImage: "location.slash",
                                   description: Text("Nearest is from where the airplane is. Put the iPhone where it sees the sky."))
        } else {
            ContentUnavailableView("Finding your position…", systemImage: "location", description: Text("Nearest is from where the airplane is."))
                .task {
                    try? await Task.sleep(for: .seconds(EmergencyFieldsSection.waitS))
                    if !Task.isCancelled { noFixYet = true }
                }
        }
    }

    /// The route to the field from here, then the plan in sight.
    private func divert(_ ident: String) {
        guard let fix else { return }
        plan.divert(to: ident, from: fix)
        nav.showPlan()
    }
}

#Preview("NearestView") {
    NavigationStack { NearestView() }
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
