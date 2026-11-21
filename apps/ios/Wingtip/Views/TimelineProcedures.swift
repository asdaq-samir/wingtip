import SwiftUI

/// A kind of procedure as FPL's line says it: its word over a picked one's
/// name ("Approach"), its short form on the chip that adds one ("APCH"),
/// and how VoiceOver asks for one.
enum ProcedureKindWords {
    static func word(_ kind: String) -> String {
        switch kind {
        case "approach": "Approach"
        case "arrival": "Arrival"
        default: "Departure"
        }
    }

    static func short(_ kind: String) -> String {
        switch kind {
        case "approach": "APCH"
        case "arrival": "ARR"
        default: "DEP"
        }
    }

    static func ask(_ kind: String) -> String {
        switch kind {
        case "approach": "an approach"
        case "arrival": "an arrival"
        default: "a departure"
        }
    }
}

/// A field's procedures of one kind as a menu's items, the FAA's for the
/// field: None first, then each, with its transitions as a submenu (the
/// owner's pull-downs, 2026-10-19). The same items wherever a kind is
/// picked: the timeline's chips and heads, the strip's ProceduresRow.
struct ProcedureMenuItems: View {
    @Environment(Plan.self) private var plan
    let ident: String
    let kind: String
    let list: ProcedureList

    var body: some View {
        Button("None") { plan.pick(nil, kind: kind, at: ident) }
        ForEach(list.procedures.filter { $0.kind == kind }) { procedure in
            if procedure.transitions.isEmpty {
                Button(procedure.name) { take(procedure, nil) }
            } else {
                Menu(procedure.name) {
                    Button("As published") { take(procedure, nil) }
                    ForEach(procedure.transitions, id: \.self) { transition in
                        Button("\(transition) transition") { take(procedure, transition) }
                    }
                }
            }
        }
    }

    private func take(_ procedure: ProcedureSummary, _ transition: String?) {
        plan.pick(ProcedurePick(ident: ident, id: procedure.id, kind: kind, name: procedure.name, transition: transition), kind: kind, at: ident)
    }
}

/// A field's runways and the kinds not picked, under its line once its
/// card says it is open (the web's PartTray, 5228f10df): "Land RWY 24"
/// and "Takeoff RWY 24", each a menu of the field's runway ends with Into
/// the Wind first (the planner's pick where none is, AirportWords.windEnd),
/// then "+ ARR", "+ APCH" and "+ DEP" for each kind the field publishes and
/// the route has none of. A stop lands and leaves, so it has both, its
/// landing's first, and when it leaves again after them; a picked kind is
/// no chip, its fixes are rows on the line (TimelineProcedureRows).
struct TimelineFieldParts: View {
    @Environment(Plan.self) private var plan
    let point: TimelinePoint
    let cards: RouteFieldCards
    let clock: TimelineClock

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: WingtipSpace.sm) { landing; leaving }
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                HStack(spacing: WingtipSpace.sm) { landing }
                HStack(spacing: WingtipSpace.sm) { leaving }
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .font(WingtipType.detail)
    }

    @ViewBuilder private var landing: some View {
        if point.role != .departure {
            runway(takeoff: false)
            kinds(TimelineRunways.arriving)
        }
    }

    @ViewBuilder private var leaving: some View {
        if point.role != .destination {
            runway(takeoff: true)
            kinds(TimelineRunways.leaving)
            // When a stop leaves again, after its takeoff's chips.
            TimelineLeavesPicker(point: point, clock: clock)
        }
    }

    /// The runway menu, its label the runway picked or the wind's.
    @ViewBuilder private func runway(takeoff: Bool) -> some View {
        let place = cards.place(point.ident)
        let ends = TimelineRunways.ends(place)
        if !ends.isEmpty {
            let key = point.ident.uppercased()
            let picked = takeoff ? plan.extras.takeoffs[key] : plan.extras.landings[key]
            let wind = place.flatMap { AirportWords.windEnd($0.runways) }
            let shown = picked ?? wind
            let verb = takeoff ? "Takeoff" : "Land"
            Menu {
                Button { plan.setRunway(nil, at: point.ident, takeoff: takeoff) } label: {
                    Label(wind.map { "Into the Wind (\($0))" } ?? "Into the Wind", systemImage: picked == nil ? "checkmark" : "wind")
                }
                Divider()
                ForEach(ends, id: \.self) { end in
                    Button { plan.setRunway(end, at: point.ident, takeoff: takeoff) } label: {
                        if picked == end { Label("Runway \(end)", systemImage: "checkmark") } else { Text("Runway \(end)") }
                    }
                }
            } label: {
                Text(shown.map { "\(verb) RWY \($0)" } ?? "\(verb) RWY \(Format.none)")
            }
            .accessibilityLabel("\(point.ident) \(takeoff ? "takeoff" : "landing") runway")
            .accessibilityValue(shown.map { "Runway \($0)\(picked == nil ? ", into the wind" : "")" } ?? "none picked")
            .accessibilityIdentifier("\(takeoff ? "takeoff" : "land")-runway-\(point.ident)")
        }
    }

    /// "+ APCH" and the rest: each kind the field has and none is picked of.
    @ViewBuilder private func kinds(_ kinds: [String]) -> some View {
        if let list = cards.procedures[point.ident.uppercased()] {
            ForEach(kinds.filter { kind in cards.has(kind, at: point.ident) && plan.picks(at: point.ident, kinds: [kind]).isEmpty }, id: \.self) { kind in
                Menu {
                    ProcedureMenuItems(ident: point.ident, kind: kind, list: list)
                } label: {
                    Text("+ \(ProcedureKindWords.short(kind))")
                }
                .accessibilityLabel("Add \(ProcedureKindWords.ask(kind)) at \(point.ident)")
                .accessibilityIdentifier("add-\(kind)-\(point.ident)")
            }
        }
    }
}

/// A procedure picked at a field, its fixes points on the route's magenta
/// line itself in the order they are flown (the owner's option D,
/// 2026-11-21; the web's TimelineProcedureRows): an arrival's and an
/// approach's rows before the field's line, a departure's after it. Its
/// head row the kind and the field in the procedure's indigo, small
/// capitals ("APPROACH · KOSH"), over its name, wrapping and never cut: the
/// whole row the kind's menu to pick another ("just tapping it should
/// show the approaches menu"). Then a row a fix: its mark an indigo ring
/// with "•••", its menu (Direct To, Cross at…), its name, the parts it
/// plays under it and its altitude at the right. Sent direct to one, its
/// ring filled in the tint and those before it dashed, skipped.
struct TimelineProcedureRows: View {
    @Environment(Plan.self) private var plan
    @Environment(FlightUI.self) private var flightUI
    let pick: ProcedurePick
    let cards: RouteFieldCards
    /// The line comes into the head from above.
    let top: Bool
    /// The line goes on below the last row.
    let bottom: Bool
    /// The list's hairline over the head.
    var hairline = false

    var body: some View {
        let drawing = cards.drawing(pick)
        // Its own fixes, not its missed approach's or a runway threshold.
        let fixes = (drawing?.fixes ?? []).filter { !$0.missed && !Self.threshold($0.ident) }
        let direct = plan.extras.procedureDirect["\(pick.ident):\(pick.id)"]
        let directAt = direct.flatMap { d in fixes.firstIndex { $0.ident == d } }
        VStack(spacing: 0) {
            TimelineColumns(top: top, bottom: bottom || !fixes.isEmpty, hairline: hairline) {
                EmptyView()
            } words: {
                head
            }
            ForEach(Array(fixes.enumerated()), id: \.offset) { i, fix in
                let isDirect = i == directAt
                let skipped = (directAt ?? 0) > i
                TimelineColumns(top: true, bottom: bottom || i < fixes.count - 1, hairline: true) {
                    Menu {
                        Text(fix.ident)
                        Button { plan.setProcedureDirect(pick, fix: isDirect ? nil : fix.ident) } label: {
                            Label(isDirect ? "Fly \(pick.name) as Charted" : "Direct To", systemImage: WingtipIcon.directTo)
                        }
                        Button { flightUI.crossAt = fix.ident } label: { Label("Cross at…", systemImage: "arrow.up.and.down") }
                    } label: {
                        FixRing(direct: isDirect, skipped: skipped).hitArea()
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("\(fix.ident): more")
                } words: {
                    fixLine(fix, drawing: drawing, direct: isDirect, skipped: skipped)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("\(pick.name), \(pick.ident)")
        .accessibilityIdentifier("procedure-rows-\(pick.kind)")
    }

    /// The head: the kind and the field over the name, the kind's menu.
    private var head: some View {
        Menu {
            if let list = cards.procedures[pick.ident.uppercased()] {
                ProcedureMenuItems(ident: pick.ident, kind: pick.kind, list: list)
            } else {
                Button("None") { plan.pick(nil, kind: pick.kind, at: pick.ident) }
            }
        } label: {
            HStack(spacing: WingtipSpace.sm) {
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    Text("\(ProcedureKindWords.word(pick.kind)) · \(pick.ident)")
                        .font(WingtipType.note.weight(.semibold))
                        .textCase(.uppercase)
                        .foregroundStyle(Color(uiColor: WingtipColor.Chart.procedure))
                    Text(pick.transition.map { "\(pick.name) · \($0)" } ?? pick.name)
                        .font(WingtipType.row.weight(.semibold))
                        .foregroundStyle(.primary)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: WingtipSpace.sm)
                Image(systemName: "chevron.up.chevron.down").font(WingtipType.note).foregroundStyle(.secondary)
            }
            .padding(.vertical, WingtipSpace.xs)
            .timelineFirstLine()
        }
        .buttonStyle(.borderless)
        .accessibilityHint("Picks another \(ProcedureKindWords.word(pick.kind).lowercased())")
        .appEntityIdentifier(pick.kind == "approach" ? SiriSaw.approach(pick) : nil)
    }

    /// A fix's words: its name, the parts it plays and how it is flown,
    /// and its altitude -- the pilot's own crossing, else the chart's.
    private func fixLine(_ fix: ProcedureFix, drawing: ProcedureDrawing?, direct: Bool, skipped: Bool) -> some View {
        let turn = drawing?.holds.contains { $0.fix == fix.ident && $0.kind == "procedure turn" } ?? false
        let roles = fix.roles.filter { $0 != "hold" } + (turn ? ["↺ procedure turn"] : [])
        let state = direct ? ["direct to"] : skipped ? ["skipped"] : []
        let sub = (roles + state).joined(separator: " · ")
        return HStack(spacing: WingtipSpace.sm) {
            VStack(alignment: .leading, spacing: 0) {
                Text(fix.ident).font(WingtipType.row.weight(.semibold)).foregroundStyle(direct ? Color.accentColor : .primary)
                if !sub.isEmpty {
                    Text(sub).font(WingtipType.note).foregroundStyle(direct ? Color.accentColor : .secondary)
                }
            }
            .opacity(skipped ? 0.5 : 1)
            Spacer(minLength: WingtipSpace.sm)
            if let own = plan.extras.crossings[fix.ident.uppercased()] {
                Text(Format.altitude(Double(own))).font(WingtipType.detail.monospacedDigit()).foregroundStyle(.tint)
            } else if let charted = try? fix.charted() {
                Text(charted).font(WingtipType.detail).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, WingtipSpace.xs)
        .timelineFirstLine()
    }

    /// A runway threshold's fix ("RW24"), not one of the procedure's own.
    static func threshold(_ ident: String) -> Bool {
        ident.hasPrefix("RW") && ident.dropFirst(2).first?.isNumber == true
    }
}

/// A procedure's fix's mark: an indigo ring with "•••", filled in the
/// tint where the airplane is sent direct to it, dashed grey once skipped.
struct FixRing: View {
    let direct: Bool
    let skipped: Bool
    @ScaledMetric(relativeTo: .body) private var size = WingtipSize.chip

    var body: some View {
        let indigo = Color(uiColor: WingtipColor.Chart.procedure)
        Image(systemName: "ellipsis")
            .font(WingtipType.note.weight(.bold))
            .foregroundStyle(direct ? Color.white : skipped ? Color.secondary : indigo)
            .frame(width: size, height: size)
            .background(direct ? Color.accentColor : WingtipInk.sheet, in: Circle())
            .overlay {
                Circle().strokeBorder(direct ? Color.accentColor : skipped ? Color.secondary.opacity(0.5) : indigo,
                                      style: StrokeStyle(lineWidth: 2, dash: skipped ? [3, 3] : []))
            }
    }
}
