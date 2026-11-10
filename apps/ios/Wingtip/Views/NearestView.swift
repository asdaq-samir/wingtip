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
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var fields: [NearestAirport] = []
    @State private var problem: String?

    private var fix: OwnShip.Fix? { dryRun.fix ?? ownShip.fix }

    var body: some View {
        List {
            if fix == nil {
                ContentUnavailableView("Finding your position…", systemImage: "location", description: Text("Nearest is from where the airplane is."))
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
            do { fields = try await Planner.nearest(lat: at.latitude, lon: at.longitude); problem = nil } catch { problem = "The nearest fields could not be found." }
        }
    }

    /// The route to the field from here, then the plan in sight.
    private func divert(_ ident: String) {
        guard let fix else { return }
        plan.divert(to: ident, from: fix)
        Navigator.shared.showPlan()
    }
}

#Preview("NearestView") {
    NavigationStack { NearestView() }
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
