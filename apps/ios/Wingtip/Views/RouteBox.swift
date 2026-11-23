import SwiftUI

/// FPL's route as its box (the web's RouteBox, the owner's canvas A of
/// 2026-11-23): every point a plain pill in the order flown, wrapped over
/// as many lines as it takes (FlowLayout) with no arrows, as ForeFlight's
/// route is; the box as tall as its pills and no taller. A pill is its
/// point's menu (RoutePointActions), as the list's mark is. A field picked
/// procedures has them as small chips beside its pill, an arrival's and an
/// approach's before it and a departure's after it, as they are flown; a
/// tap turns the box back to the list, where they are picked. The fuel
/// stops the planner suggests for a flight are folded into one dashed
/// pill after the point it leaves ("+3 fuel stops"). After the last pill
/// the route is typed on: a field there is the new destination, a whole
/// filed route the route (Plan.typeRoute, the engine's route_read). The
/// round toggle at the box's lower right turns it back into the grouped
/// list in the same place (RouteBoxToggle). It replaces the Type Route
/// sheet the keyboard button opened: one way in.
struct RouteBoxSection: View {
    @Environment(Plan.self) private var plan
    let cards: RouteFieldCards
    /// The one search asked to pick a point (a pill's Change).
    let ask: (PointAsk) -> Void
    @State private var typed = ""
    @State private var problem: String?
    @State private var looking = false

    var body: some View {
        let points = plan.timelinePoints
        let unknown = plan.unknownPoint
        Section {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                FlowLayout {
                    ForEach(points) { point in
                        let closed = point.field ? cards.problem(point.ident) : nil
                        ForEach(chips(point, TimelineRunways.arriving)) { RouteBoxChip(pick: $0) }
                        RouteBoxPill(point: point, problem: unknown == point.ident ? "Not an airport or waypoint we know." : closed,
                                     caution: caution(point), ask: ask)
                        ForEach(chips(point, TimelineRunways.leaving)) { RouteBoxChip(pick: $0) }
                        if let flight = suggested(point) { FuelStopFold(flight: flight) }
                    }
                    field
                }
                HStack(alignment: .top, spacing: WingtipSpace.sm) {
                    if let problem { ProblemLine(problem) }
                    Spacer(minLength: WingtipSpace.sm)
                    RouteBoxToggle()
                }
            }
            .padding(.vertical, WingtipSpace.xs)
        } header: {
            Text("Route")
        }
    }

    /// What is typed after the last pill: no word in it once there is a
    /// route (the owner, 2026-11-23: no "Destination" placeholder), named
    /// in full for VoiceOver.
    private var field: some View {
        TextField("Route", text: $typed, prompt: Text(""))
            .font(WingtipType.row.weight(.semibold))
            .textInputAutocapitalization(.characters)
            .autocorrectionDisabled()
            .submitLabel(.go)
            .frame(minWidth: WingtipSize.tapTarget * 2, minHeight: WingtipSize.rowBadge)
            .disabled(looking)
            .onSubmit(use)
            .onChange(of: typed) { _, _ in problem = nil }
            .accessibilityLabel("Add stop, the new destination")
            .accessibilityHint("Type a field, or a whole route as KPWK V100 KLAS")
            .accessibilityIdentifier("route-type")
    }

    /// The procedures picked at a field of `kinds`, once its card says it
    /// is open (decision 0043), as its line on the list shows them.
    private func chips(_ point: TimelinePoint, _ kinds: [String]) -> [ProcedurePick] {
        guard point.field, cards.known(point.ident), cards.problem(point.ident) == nil else { return [] }
        return plan.picks(at: point.ident, kinds: kinds)
    }

    /// The planner's suggested stops for the flight leaving this point, as
    /// Add Fuel Stops puts them in (RouteTanks.withFuelStops: a break's
    /// stop is not a fuel stop), while there are any to add.
    private func suggested(_ point: TimelinePoint) -> FuelStopSuggestion? {
        guard plan.fuelStopsToAdd != nil else { return nil }
        return (plan.totals?.fuelStops ?? []).first {
            $0.reason != "break" && !$0.stops.isEmpty && $0.departure.uppercased() == point.ident.uppercased()
        }
    }

    /// Why the flight leaving this point is short with no stop offered,
    /// the planner's words (Plan.noFuelStop), for the pill's "!".
    private func caution(_ point: TimelinePoint) -> String? {
        let short = (plan.totals?.noFuelStop ?? []).filter { $0.departure.uppercased() == point.ident.uppercased() }
        return RouteTanks.noFuelStopWords(short)
    }

    /// The words read and planned; the field emptied once they are, else
    /// why not said under the box, the words left to be put right.
    private func use() {
        let words = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        looking = true
        Task {
            problem = await plan.typeRoute(words)
            looking = false
            if problem == nil { typed = "" }
        }
    }
}

/// One point's pill: its ident (My Position for the airplane's) alone in
/// the stock bordered capsule in the primary ink's wash, the web's
/// bg-foreground/8 (the owner, 2026-11-23: "Keep it simple pills"), no
/// mark before it. One not known or that NASR lists closed is a red pill
/// (decision 0043), a caution a "!" at its corner; both are said at the
/// top of its menu.
struct RouteBoxPill: View {
    @Environment(Plan.self) private var plan
    let point: TimelinePoint
    let problem: String?
    let caution: String?
    let ask: (PointAsk) -> Void

    var body: some View {
        Menu {
            if let problem { Text(problem) }
            if let caution { Text(caution) }
            RoutePointActions(ident: point.ident, role: point.actionRole) {
                ask(.change(index: point.index, ident: point.ident))
            }
        } label: {
            Text(point.name).font(WingtipType.row.weight(.semibold)).lineLimit(1)
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .tint(problem == nil ? Color.primary : WingtipInk.problem)
        .overlay(alignment: .topTrailing) {
            if caution != nil, problem == nil {
                Image(systemName: "exclamationmark.circle.fill")
                    .font(WingtipType.badge)
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, WingtipInk.caution)
                    .offset(x: WingtipSpace.xs, y: -WingtipSpace.xs)
                    .accessibilityHidden(true)
            }
        }
        .hitArea()
        .accessibilityLabel(spoken)
        .accessibilityIdentifier("route-pill-\(point.ident)")
    }

    private var spoken: String {
        var words = [RoutePointActions.spoken(point.name, plan: plan)]
        if point.fuelStop { words.append("fuel stop") }
        if let problem { words.append(problem) } else if let caution { words.append(caution) }
        return words.joined(separator: ", ") + ": more"
    }
}

/// A procedure picked at a field, beside its pill: its ident small in the
/// tint, a tap the list, where it is picked and changed (the web's
/// ProcedureChip, which opens the timeline's Procedures from the box).
struct RouteBoxChip: View {
    @Environment(FlightUI.self) private var flightUI
    let pick: ProcedurePick

    var body: some View {
        Button { flightUI.routeBox = false } label: { Text(pick.id).font(WingtipType.label) }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.mini)
            .hitArea()
            .accessibilityLabel("\(pick.name), in the list")
            .accessibilityIdentifier("route-chip-\(pick.id)")
    }
}

/// A flight's suggested fuel stops folded into one pill in the caution's
/// ink after the point it leaves, "+3 fuel stops", or the one's ident (the
/// web's FuelStopFold); its menu names them and puts them in (Add Fuel
/// Stops, every flight's in one step as on the list, Plan.addFuelStops).
struct FuelStopFold: View {
    @Environment(Plan.self) private var plan
    let flight: FuelStopSuggestion

    var body: some View {
        let idents = flight.stops.map(\.ident)
        Menu {
            Section("\(flight.departure) → \(flight.destination)") {
                ForEach(idents, id: \.self) { Text($0) }
            }
            Button { plan.addFuelStops() } label: { Label("Add Fuel Stops", systemImage: "fuelpump") }
        } label: {
            Label(idents.count == 1 ? idents[0] : "+\(idents.count) fuel stops", systemImage: "fuelpump")
                .font(WingtipType.detail.weight(.semibold))
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        .tint(WingtipInk.caution)
        .hitArea()
        .accessibilityLabel("Suggested fuel stops: \(idents.joined(separator: ", "))")
        .accessibilityIdentifier("route-fuel-fold")
    }
}

/// The round toggle at the route's lower right that turns the grouped
/// list into the box of pills in the same place, and back (the web's
/// TypeRouteButton, a Toggle in its tint): its keyboard glyph alone on the
/// tint's wash, and filled in the tint while the box is up, so it reads as
/// pressed and stays under the finger on both faces. The stock bordered
/// and prominent buttons draw the two states; the button-style Toggle's
/// "on" was only a wash, the same as off at a glance (the simulator's
/// screenshot, 2026-11-23). No Undo beside it (the owner, 2026-11-23); the
/// plan's Undo takes a change back.
struct RouteBoxToggle: View {
    @Environment(FlightUI.self) private var flightUI

    var body: some View {
        let on = flightUI.routeBox
        Group {
            if on {
                button.buttonStyle(.borderedProminent)
            } else {
                button.buttonStyle(.bordered)
            }
        }
        .buttonBorderShape(.circle)
        .controlSize(.small)
        .hitArea()
        .accessibilityAddTraits(on ? .isSelected : [])
        .accessibilityHint(on ? "Shows the route as its list" : "Shows the route as a box to type in")
        .accessibilityIdentifier("route-type-open")
    }

    private var button: some View {
        Button { flightUI.routeBox.toggle() } label: {
            Label("Type the Route", systemImage: "keyboard").labelStyle(.iconOnly)
        }
    }
}

extension TimelinePoint {
    /// Its place in the route as its menu's actions take it.
    var actionRole: RoutePointActions.Role {
        switch role {
        case .departure: .departure
        case .stop: .stop
        case .destination: .destination
        }
    }
}
