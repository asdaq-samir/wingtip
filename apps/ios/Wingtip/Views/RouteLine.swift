import SwiftUI

/// The route line's chips as the planner sends them (RouteOptions.chips,
/// the canvas "Redesign: route options", 2026-10-26): its words and its
/// order, "None" first, so the web app and the phone offer the same.
enum RouteLine {
    /// "None", for the route as typed before the planner answers or where
    /// it sends no chips.
    static let none = RouteChip(fuel: [], key: "none", label: "None", stops: [])

    static func chips(_ routes: RouteOptions?) -> [RouteChip] {
        let sent = routes?.chips ?? []
        return sent.isEmpty ? [none] : sent
    }

    /// The chip standing for the way flown: "None" for the typed route,
    /// else the picked chip, as the latest answer words it where it still
    /// offers it.
    static func picked(_ chips: [RouteChip], chip: RouteChip?) -> RouteChip {
        guard let chip else { return chips.first { $0.key == "none" } ?? none }
        return chips.first { $0.key == chip.key && $0.stops == chip.stops } ?? chip
    }

    /// Whether the line is drawn: not where the planner has answered that
    /// there is no way but the route itself, unless a way is flown.
    static func shows(_ routes: RouteOptions?, picked: RouteChip?, problem: String?) -> Bool {
        guard let routes, problem == nil, picked == nil else { return true }
        return !(routes.chips ?? []).isEmpty
    }
}

/// The route line under the route's ends: the system's menu picker of
/// the ways to fly it (the owner, 2026-11-10: stock over the hand-built
/// chips, whose two-second fold the stock control has no place for). The
/// way picked is flown at once, the course, the stops and the nav log
/// following; there is nothing to accept, and "None" goes back to the
/// route as typed. Nothing is refused: what the way flown still crosses
/// is said under it, in the planner's words.
struct RouteLineRow: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        let picked = RouteLine.picked(RouteLine.chips(plan.routes), chip: plan.pickedChip)
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(spacing: WingtipSpace.md) {
                RouteWayPicker()
                if plan.routes == nil && plan.routesProblem == nil {
                    ProgressView().controlSize(.small)
                }
            }
            if let problem = plan.routesProblem {
                Label(problem, systemImage: "exclamationmark.triangle")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            // What the way flown still crosses, as the planner names it:
            // for "None", the typed route's.
            if let routes = plan.routes {
                ForEach(Array((picked.crosses ?? []).enumerated()), id: \.offset) { _, index in
                    if routes.hazards.indices.contains(index), routes.hazards[index].kind != "fuel" {
                        let hazard = routes.hazards[index]
                        Label(hazard.name.isEmpty ? hazard.kind : hazard.name, systemImage: "exclamationmark.triangle.fill")
                            .font(.footnote).foregroundStyle(WingtipInk.caution)
                    }
                }
            }
        }
    }
}

/// The ways to fly the route as the planner words and orders them, in
/// the system's menu picker: the plan's sheet and the strip's head both
/// offer it. A way picked is flown (Plan.use); "None" is the route as typed.
struct RouteWayPicker: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        let chips = RouteLine.chips(plan.routes)
        let picked = RouteLine.picked(chips, chip: plan.pickedChip)
        Picker(selection: Binding(get: { picked.id }, set: { id in chips.first { $0.id == id }.map(take) })) {
            ForEach(chips) { Text($0.label).tag($0.id) }
        } label: {
            Label("Route", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
        }
        .pickerStyle(.menu)
        .accessibilityLabel("Route options")
        .accessibilityIdentifier("route-ways")
    }

    private func take(_ chip: RouteChip) {
        if chip.key == "none" {
            plan.useTyped()
        } else if plan.pickedChip != chip {
            plan.use(chip)
        }
    }
}

#Preview("RouteLineRow") {
    List { RouteLineRow() }
        .environment(Plan())
}
