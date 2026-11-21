import SwiftUI

/// A field's procedures as pull-down menus, the owner's pick for the web
/// app (2026-10-19): a departure out of the route's departure, an arrival
/// and an approach into a stop or the destination, each a menu of the
/// FAA's procedures for the field, none picked until the pilot picks.
/// Picked, the planner flies it and plans the descent to it.
struct ProceduresRow: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    let ident: String
    /// The kinds this field takes: "departure" for the route's departure,
    /// "arrival" and "approach" for the rest.
    let kinds: [String]
    @State private var list: ProcedureList?
    /// Said in the row where the list couldn't be fetched, never a spinner left turning.
    @State private var problem: String?

    var body: some View {
        HStack(spacing: WingtipSpace.sm) {
            Text(ident).font(.body.monospaced())
            Spacer()
            if let list {
                ForEach(kinds, id: \.self) { kind in
                    let mine = list.procedures.filter { $0.kind == kind }
                    if !mine.isEmpty {
                        Menu {
                            ProcedureMenuItems(ident: ident, kind: kind, list: list)
                        } label: {
                            let picked = plan.procedures.first { $0.ident == ident && $0.kind == kind }
                            Label(picked?.name ?? kind.capitalized, systemImage: "chevron.down")
                                .labelStyle(.titleAndIcon)
                                .font(.subheadline)
                                .foregroundStyle(picked == nil ? Color.secondary : accent)
                                .appEntityIdentifier(picked.flatMap { $0.kind == "approach" ? SiriSaw.approach($0) : nil })
                        }
                    }
                }
            } else if let problem {
                ProblemLine(problem)
            } else {
                ProgressView().controlSize(.small)
            }
        }
        .task(id: ident) {
            do {
                list = try await Planner.procedures(ident)
                problem = nil
            } catch {
                list = nil
                problem = "Its procedures could not be fetched."
            }
        }
    }
}
