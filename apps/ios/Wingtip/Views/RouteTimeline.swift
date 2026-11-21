import SwiftUI

/// FPL's route on the ground as one timeline (the web's TimelineRoute,
/// the owner's two-row timeline of 2026-11-17 and its look of 2026-11-20):
/// a line a point -- the departure, each stop, the destination -- in one
/// inset grouped section, the route's magenta joining their marks
/// (TimelineThread). Each line has the point's mark, its menu (TimelineMark,
/// RoutePointActions); its ident, a tap that asks the one search to change
/// it (PointAsk); the fuel in the tanks there, a tap that sets it at a
/// field the airplane leaves (TimelineGauge); and its time at the right. A
/// field NASR lists closed, or whose card could not be had, says why in
/// red under it (decision 0043). Stops are swiped off and dragged into
/// another order with the system's list edits (Edit at the header's
/// right); the ends are changed, never removed. Add a Stop is the last
/// row, the fuel stops' button after it.
struct RouteTimelineSection: View {
    @Environment(Plan.self) private var plan
    let cards: RouteFieldCards
    /// The one search asked to pick a point (Add Stop, Change Stop, an end).
    let ask: (PointAsk) -> Void
    /// A gauge tapped: its field's fuel to set (FuelSetSheet).
    let setFuel: (FuelSetAsk) -> Void

    var body: some View {
        let points = plan.timelinePoints
        let tanks = plan.tanks
        let clock = TimelineClock(leaves: plan.extras.depart ?? Date(), points: points, zones: cards.zones)
        Section {
            ForEach(points) { point in
                TimelinePointRow(point: point, last: point.index == points.count - 1, cards: cards, clock: clock,
                                 tank: tanks[point.tank], ask: ask, setFuel: setFuel)
                    .listRowInsets(EdgeInsets(top: 0, leading: WingtipSpace.lg, bottom: 0, trailing: WingtipSpace.lg))
                    .deleteDisabled(point.role != .stop)
                    .moveDisabled(point.role != .stop)
            }
            .onDelete { plan.removeTimeline(at: $0) }
            .onMove { plan.moveTimeline(from: $0, to: $1) }
            Button { ask(.addStop) } label: { Label(Wording.addStop, systemImage: "plus") }
                .accessibilityIdentifier("timeline-add-stop")
            FuelStopsButton()
        } header: {
            // The stops' Edit (delete, move) at the header's right, as
            // iOS's lists put it.
            HStack {
                Text("Route")
                Spacer()
                if !plan.stops.isEmpty { EditButton().textCase(nil) }
            }
        }
    }
}

/// One point's line on the timeline (the web's TimelineLine): its mark
/// and menu, its ident, its tanks, its time, why it cannot be flown to
/// where it cannot, its runways and the kinds of procedure not picked;
/// with a procedure picked there its fixes' rows on the line before it
/// (an arrival, an approach) or after it (a departure).
struct TimelinePointRow: View {
    @Environment(Plan.self) private var plan
    let point: TimelinePoint
    let last: Bool
    let cards: RouteFieldCards
    let clock: TimelineClock
    let tank: TankAt?
    let ask: (PointAsk) -> Void
    let setFuel: (FuelSetAsk) -> Void

    var body: some View {
        let problem = point.field ? cards.problem(point.ident) : nil
        // Its runways and procedures only once its card says it is open,
        // never offered to land by before (decision 0043).
        let opens = point.field && cards.known(point.ident) && problem == nil
        let before = opens && point.role != .departure ? plan.picks(at: point.ident, kinds: TimelineRunways.arriving) : []
        let after = opens && point.role != .destination ? plan.picks(at: point.ident, kinds: TimelineRunways.leaving) : []
        VStack(spacing: 0) {
            // An arrival's and an approach's fixes on the line before the
            // field, a departure's after it (TimelineProcedureRows).
            ForEach(Array(before.enumerated()), id: \.element.id) { i, pick in
                TimelineProcedureRows(pick: pick, cards: cards, top: point.index > 0 || i > 0, bottom: true, hairline: i > 0)
            }
            line(problem: problem, opens: opens, before: !before.isEmpty, after: !after.isEmpty)
            ForEach(Array(after.enumerated()), id: \.element.id) { i, pick in
                TimelineProcedureRows(pick: pick, cards: cards, top: true, bottom: !last || i < after.count - 1, hairline: true)
            }
        }
    }

    /// The point's own line: its mark, ident, tanks and time, why it
    /// cannot be flown to, and its runways and the kinds not picked.
    private func line(problem: String?, opens: Bool, before: Bool, after: Bool) -> some View {
        let category = point.field ? cards.place(point.ident)?.metar?.flightCategory : nil
        return TimelineColumns(top: point.index > 0 || before, bottom: !last || after, hairline: before) {
            Menu {
                RoutePointActions(ident: point.ident, role: role, change: change)
            } label: {
                TimelineMark(point: point, problem: problem != nil, category: category).hitArea()
            }
            .buttonStyle(.borderless)
            .accessibilityLabel("\(RoutePointActions.spoken(point.ident, plan: plan))\(point.fuelStop ? ", fuel stop" : ""): more")
            .accessibilityIdentifier("timeline-mark-\(point.ident)")
        } words: {
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                HStack(spacing: WingtipSpace.sm) {
                    Button(action: change) {
                        Text(point.name)
                            .font(WingtipType.row)
                            .foregroundStyle(problem == nil ? Color.primary : WingtipInk.problem)
                            .lineLimit(1)
                    }
                    .buttonStyle(.borderless)
                    .hitArea()
                    .accessibilityLabel("\(point.name)\(category.map { ", \($0)" } ?? ""): change it")
                    .accessibilityIdentifier("timeline-ident-\(point.ident)")
                    if let tank { TimelineGauge(point: point, tank: tank, settable: settable, setFuel: setFuel) }
                    Spacer(minLength: WingtipSpace.sm)
                    TimelineTime(point: point, clock: clock)
                }
                .timelineFirstLine()
                if let problem {
                    Text(problem)
                        .font(WingtipType.note)
                        .foregroundStyle(WingtipInk.problem)
                        .padding(.bottom, WingtipSpace.sm)
                        .accessibilityIdentifier("timeline-problem")
                }
                if opens {
                    TimelineFieldParts(point: point, cards: cards, clock: clock).padding(.bottom, WingtipSpace.sm)
                }
            }
        }
    }

    private var role: RoutePointActions.Role {
        switch point.role {
        case .departure: .departure
        case .stop: .stop
        case .destination: .destination
        }
    }

    /// The point changed: the one search asked to pick another in its place.
    private func change() { ask(.change(index: point.index, ident: point.ident)) }

    /// Whether its fuel is set here: the departure's on board, a field
    /// landed at's after fuelling; a waypoint's and the destination's are
    /// read only (the web's FuelSet).
    private var settable: Bool { point.role == .departure || (point.role == .stop && point.field) }
}

/// A line's time at its right (the web's timeOf): at the departure when
/// it leaves, the one button with the hour and minute wheels
/// (TimelineDepartPicker); at the others their arrival from the planner's
/// minutes, a dash with no airplane or before the nav log; each with its
/// zone once the route crosses one (TimelineClock).
struct TimelineTime: View {
    let point: TimelinePoint
    let clock: TimelineClock

    var body: some View {
        if point.role == .departure {
            TimelineDepartPicker(clock: clock, point: point)
        } else if let at = clock.at(point) {
            let said = clock.words(at, at: point)
            ZonedTime(time: said.time, zone: said.zone)
                .accessibilityLabel("Arrives \(said.time)\(said.zone.map { " \($0)" } ?? "")")
                .accessibilityIdentifier("timeline-time")
        } else {
            Text(Format.none).font(WingtipType.row).foregroundStyle(.secondary).accessibilityIdentifier("timeline-time")
        }
    }
}

/// A time with its zone smaller after it, "18:24 MST" (the web's ZonedTime).
struct ZonedTime: View {
    let time: String
    let zone: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.xxs) {
            Text(time).font(WingtipType.row.monospacedDigit())
            if let zone { Text(zone).font(WingtipType.badge) }
        }
        .foregroundStyle(.secondary)
        .lineLimit(1)
        .fixedSize()
    }
}

/// When the flight leaves, on the departure's line: the system's compact
/// time picker, one button that opens the hour and minute wheels (the
/// web's DepartPicker, ab0afd9e8), in the departure's own clock once the
/// route crosses a zone, its zone after it. A time of day earlier than
/// now is tomorrow's (TimelineClock.next). Picked, the planner's `depart`.
struct TimelineDepartPicker: View {
    @Environment(Plan.self) private var plan
    let clock: TimelineClock
    let point: TimelinePoint

    var body: some View {
        let zone = clock.zone(point)
        HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.xxs) {
            DatePicker("Departure Time", selection: Binding(get: { clock.leaves }, set: { picked in
                plan.setDepart(TimelineClock.next(picked, in: zone))
            }), displayedComponents: [.hourAndMinute])
                .labelsHidden()
                .environment(\.timeZone, zone)
                .accessibilityIdentifier("timeline-depart")
            if clock.zoned, let name = zone.abbreviation(for: clock.leaves) {
                Text(name).font(WingtipType.badge).foregroundStyle(.secondary)
            }
        }
    }
}

/// When a stop leaves again, after its takeoff's chips (the web's leave
/// time in the takeoff's tray, d56facda9): the same picker, from when it
/// lands to a day after (the planner's `own_ground`), set as its minutes
/// on the ground (`ground`); none picked, the planner's turnaround after
/// it lands. To the whole minute, in the stop's own clock once the route
/// crosses a zone.
struct TimelineLeavesPicker: View {
    @Environment(Plan.self) private var plan
    let point: TimelinePoint
    let clock: TimelineClock

    var body: some View {
        if point.role == .stop, let lands = clock.at(point) {
            let own = plan.extras.ground[point.ident.uppercased()].map(Double.init)
            let ground = own ?? point.groundMin ?? 0
            HStack(spacing: WingtipSpace.xs) {
                Text("Leaves").foregroundStyle(.secondary)
                DatePicker("Departure from \(point.ident)", selection: Binding(get: { lands.addingTimeInterval(ground * 60) }, set: { picked in
                    plan.setGround(point.ident, minutes: Int((picked.timeIntervalSince(lands) / 60).rounded()))
                }), in: lands...lands.addingTimeInterval(Double(Timeline.dayMin) * 60), displayedComponents: [.hourAndMinute])
                    .labelsHidden()
                    .environment(\.timeZone, clock.zone(point))
                    .accessibilityIdentifier("leaves-\(point.ident)")
            }
        }
    }
}
