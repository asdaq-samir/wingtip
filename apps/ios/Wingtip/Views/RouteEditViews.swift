import CoreLocation
import SwiftUI

/// The alerts of the flight's extras: a fix off a point, a procedure's
/// fix's crossing altitude, and what the engine refused of one; and the
/// point whose altitude the Profile opens on. The cards it once held (an
/// airplane, a hold, a flown track, a leg) are Navigator's, as every card is.
@MainActor
@Observable
final class FlightUI {
    /// The point whose altitude the Profile opens on, its Start At / Cross
    /// At popover up (a stop's "Set Altitude…"): the profile's one
    /// altitude control, taken and cleared there (ProfileCard).
    var altitudeAt: String?
    /// The point a fix is made off.
    var fixFrom: String?
    /// A procedure's fix whose crossing altitude is asked for.
    var crossAt: String?
    /// What the engine refused of a figure typed into one of the alerts,
    /// said in an alert of its own rather than the figure dropped unsaid.
    var problem: String?
}

/// The alerts that ask for one figure or two, as iOS asks: a fix off a
/// point (its course and distance) and a procedure's fix's crossing
/// altitude. A point's own altitude is the Profile's (LegAltitudePopover).
struct PointAlerts: ViewModifier {
    @Environment(FlightUI.self) private var flightUI
    /// Whether this view is the top of the stack, the one that presents.
    let active: Bool
    @Environment(Plan.self) private var plan
    @State private var typed = ""
    @State private var course = ""
    @State private var distance = ""

    func body(content: Content) -> some View {
        let ui = flightUI
        content
            .alert(ui.fixFrom.map { "A fix from \($0)" } ?? "A fix", isPresented: shown(\.fixFrom), presenting: ui.fixFrom) { from in
                TextField("Course, as 090", text: $course).keyboardType(.numberPad)
                TextField("Distance, nm", text: $distance).keyboardType(.decimalPad)
                Button("Add") {
                    if let ident = refused({ try PointAltitude.frd(from: from, course: course, distance: distance) }) { plan.insertFix(ident, after: from) }
                    course = ""; distance = ""
                }
                Button("Cancel", role: .cancel) { course = ""; distance = "" }
            } message: { from in
                Text("Its magnetic course from \(from), a VOR's radial, and how far. Flown over next.")
            }
            .alert(ui.crossAt.map { "Cross \($0) at" } ?? "Cross at", isPresented: shown(\.crossAt), presenting: ui.crossAt) { fix in
                TextField("Feet", text: $typed).keyboardType(.numberPad)
                Button("Set") {
                    if let feet = refused({ try PointAltitude.feet(typed, waypoint: false) }) { plan.setCrossing(at: fix, feet: feet) }
                    typed = ""
                }
                if plan.extras.crossings[fix.uppercased()] != nil {
                    Button("As Charted", role: .destructive) { plan.setCrossing(at: fix, feet: nil); typed = "" }
                }
                Button("Cancel", role: .cancel) { typed = "" }
            } message: { _ in
                Text("The altitude ATC gave you to cross it at, in feet above sea level.")
            }
            .alert("Couldn't Read That", isPresented: shown(\.problem), presenting: ui.problem) { _ in
                Button("OK", role: .cancel) {}
            } message: { problem in
                Text(problem)
            }
    }

    /// What was typed, read; where the engine refused, nil and the reason
    /// in FlightUI.problem.
    private func refused<T>(_ body: () throws -> T?) -> T? {
        do { return try body() } catch {
            flightUI.problem = error.localizedDescription
            return nil
        }
    }

    /// Whether one of the alerts is up, its subject set; put away, cleared.
    private func shown(_ subject: ReferenceWritableKeyPath<FlightUI, String?>) -> Binding<Bool> {
        Binding(get: { active && flightUI[keyPath: subject] != nil }, set: { if !$0 { flightUI[keyPath: subject] = nil } })
    }
}

/// The route flown direct to a point, said over the route's figures, and
/// Cancel: the route as it was (the web app's DirectStrip).
struct DirectStrip: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        if let direct = plan.extras.direct {
            HStack {
                Label("Direct to \(direct)", systemImage: "arrow.up.right").font(.body.weight(.semibold))
                Spacer()
                Button("Cancel") { plan.cancelDirect() }
            }
        }
        // A Direct to that couldn't be planned, said where it was asked.
        ProblemLine(plan.directProblem)
    }
}

/// FPL's section for the route's own edits: the Direct to, its ends'
/// menus, the holds set, the procedures' fixes, and the pages of the
/// flight in the air.
struct RouteExtrasSection: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @AppStorage(FlightRules.key) private var rules: FlightRules = .vfr

    var body: some View {
        if plan.routed {
            Section {
                DirectStrip()
                RoutePointMenu(ident: plan.dep, role: .departure)
                RoutePointMenu(ident: plan.dest, role: .destination)
                // Under IFR, the alternate after the destination, as the
                // web files it (14 CFR 91.169).
                if rules == .ifr { AlternateRow() }
                ForEach(plan.extras.holds) { hold in
                    Button { nav.push(.hold(hold.fix)) } label: {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text("Hold at \(hold.fix)").foregroundStyle(.primary)
                            Text(hold.words).font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { at in at.map { plan.extras.holds[$0].fix }.forEach { plan.setHold(at: $0, nil) } }
                ForEach(plan.procedures) { pick in
                    NavigationLink(value: SheetPage.flight("fixes:\(pick.ident):\(pick.id)")) {
                        LabeledContent("\(pick.name) fixes", value: plan.extras.procedureDirect["\(pick.ident):\(pick.id)"].map { "Direct \($0)" } ?? pick.ident)
                    }
                }
            } header: {
                Text("Route")
            }
            Section("In Flight") {
                // The one Nearest list, with Divert (NearestView).
                NavigationLink(value: SheetPage.screen(.nearest)) { Label("Nearest for a Diversion", systemImage: WingtipIcon.nearest) }
                NavigationLink(value: SheetPage.flight("notes")) { Label("Checkpoint Notes", systemImage: "text.bubble") }
                NavigationLink(value: SheetPage.flight("file")) { Label("File Flight Plan", systemImage: WingtipIcon.send) }
            }
        }
    }
}

/// The pages FPL opens by name beyond its own (its navigationDestination's
/// default): a procedure's fixes, the checkpoints' notes and filing with
/// Flight Service.
struct FlightPage: View {
    let name: String

    var body: some View {
        if name.hasPrefix("fixes:") {
            let parts = name.split(separator: ":").map(String.init)
            ProcedureFixesView(ident: parts.count > 1 ? parts[1] : "", id: parts.count > 2 ? parts[2] : "")
        } else {
            switch name {
            case "notes": CheckpointNotesView()
            case "file": FlightServiceView()
            case "alternate": AlternatePage()
            default: EmptyView()
            }
        }
    }
}

/// A hold at a point of the route, set as Garmin's and ForeFlight's
/// pilot-defined holds are (the web app's HoldSheet): the course, inbound
/// or outbound; the turns, right (the standard pattern) or left; the legs
/// by time or distance; and how long. The planner works out the entry
/// from the course flown to it and adds its time and fuel.
struct HoldSheet: View {
    @Environment(Navigator.self) private var nav
    let fix: String
    @Environment(Plan.self) private var plan
    @State private var course = ""
    @State private var inbound = true
    @State private var right = true
    @State private var timed = true
    @State private var legMin = 1.0
    @State private var legNm = 4.0
    @State private var length = "2T"
    @State private var problem: String?
    /// The form as it opened, so Cancel asks only after an edit.
    @State private var opened: String?
    @State private var askingCancel = false

    static let legMinutes = [1.0, 1.5, 2, 3]
    static let legMiles = [2.0, 3, 4, 5, 10]

    /// Done: back where it was opened from, a card's stack or the plan.
    private func dismiss() { nav.finish(.hold(fix)) }
    static let lengths = ["1T", "2T", "3T", "4T", "10M", "15M", "20M", "30M"]

    /// "2 turns", "1 turn", "10 min".
    static func lengthWords(_ code: String) -> String {
        guard let n = Int(code.dropLast()) else { return code }
        return code.hasSuffix("T") ? "\(n) \(n == 1 ? "turn" : "turns")" : "\(n) min"
    }

    private var was: Hold? { plan.hold(at: fix) }
    /// The leg flown to it, for the course and the altitude it is reached at.
    private var legIn: Leg? { plan.legs.first { $0.to.uppercased() == fix.uppercased() } }

    /// An edit form, as HIG Sheets has one: Cancel at the leading edge,
    /// Add or Change at the trailing, nothing changed until it is tapped.
    var body: some View {
        Form {
            Section {
                Picker("The course is", selection: $inbound) {
                    Text("Inbound").tag(true)
                    Text("Outbound").tag(false)
                }
                .pickerStyle(.segmented)
                LabeledContent("Course") {
                    TextField("270", text: $course).keyboardType(.numberPad).multilineTextAlignment(.trailing).font(.body.monospacedDigit())
                }
                Picker("Turns", selection: $right) {
                    Text("Right").tag(true)
                    Text("Left").tag(false)
                }
                .pickerStyle(.segmented)
            }
            Section {
                Picker("Legs by", selection: $timed) {
                    Text("Time").tag(true)
                    Text("Distance").tag(false)
                }
                .pickerStyle(.segmented)
                if timed {
                    Picker("Leg time", selection: $legMin) {
                        ForEach(Self.legMinutes, id: \.self) { Text("\(String(format: "%g", $0)) min").tag($0) }
                    }
                } else {
                    Picker("Leg distance", selection: $legNm) {
                        ForEach(Self.legMiles, id: \.self) { Text("\(String(format: "%g", $0)) nm").tag($0) }
                    }
                }
                Picker("Hold for", selection: $length) {
                    ForEach(Self.lengths, id: \.self) { Text(Self.lengthWords($0)).tag($0) }
                }
                if let problem {
                    Text("The leg time for this altitude couldn't be worked out: \(problem)").foregroundStyle(WingtipInk.caution)
                }
            }
            if was != nil {
                Section {
                    Button("Remove Hold", role: .destructive) { plan.setHold(at: fix, nil); dismiss() }
                }
            }
        }
        .navigationTitle("Hold at \(fix)")
        .navigationBarTitleDisplayMode(.inline)
        // Cancel is the form's way out, asking first after an edit.
        .formGuard(edited: edited)
        .toolbar {
            FormCancel(edited: edited, cancel: { dismiss() }, asking: $askingCancel)
            ToolbarItem(placement: .confirmationAction) {
                Button(was == nil ? "Add" : "Change") { set() }.disabled(degrees == nil)
            }
        }
        .onAppear {
            fill()
            if opened == nil { opened = formKey }
        }
    }

    /// Everything the form holds, one line, to tell an edit.
    private var formKey: String { "\(course)|\(inbound)|\(right)|\(timed)|\(legMin)|\(legNm)|\(length)" }
    private var edited: Bool { opened.map { $0 != formKey } ?? false }

    private var degrees: Int? {
        let digits = course.filter(\.isNumber)
        guard digits.count == 3, let deg = Int(digits), deg <= 360 else { return nil }
        return deg
    }

    /// The hold there now, else the course flown to it as the inbound
    /// course -- straight ahead, a direct entry (AIM 5-3-8) -- its magnetic
    /// course the leg's true course less the planner's variation, as the
    /// web app takes it; and the legs' minutes for the altitude it is
    /// reached at (Hold.legMinutes).
    private func fill() {
        if let was {
            course = String(format: "%03d", was.inbound == 0 ? 360 : was.inbound)
            right = was.right
            timed = was.legMin != nil
            legMin = was.legMin ?? 1
            legNm = was.legNm ?? 4
            length = was.turns.map { "\($0)T" } ?? "\(was.minutes ?? 10)M"
        } else if let leg = legIn {
            let magnetic = ((leg.trueCourseDeg - leg.magneticVariationDeg).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
            let rounded = Int(magnetic.rounded()) % 360
            course = String(format: "%03d", rounded == 0 ? 360 : rounded)
            // Where the engine refuses, the minute the form starts on
            // stands and the reason shows under it.
            do { legMin = try Hold.legMinutes(altitudeFt: leg.altitudeFt); problem = nil } catch { problem = error.localizedDescription }
        }
    }

    private func set() {
        guard let degrees else { return }
        let inboundDeg = (inbound ? degrees : degrees + 180) % 360
        let n = Int(length.dropLast()) ?? 2
        let hold = Hold(fix: fix, inbound: inboundDeg, right: right, legMin: timed ? legMin : nil, legNm: timed ? nil : legNm,
                        turns: length.hasSuffix("T") ? n : nil, minutes: length.hasSuffix("M") ? n : nil)
        plan.setHold(at: fix, hold)
        dismiss()
    }
}

/// A picked procedure's fixes, each with the chart's altitude: Direct To
/// it, as ATC sends an airplane, or flown as charted again; and the
/// altitude to cross it at, the pilot's own in the chart's place (the web
/// app's FixCard and FixBranch).
struct ProcedureFixesView: View {
    @Environment(FlightUI.self) private var flightUI
    let ident: String
    let id: String
    @Environment(Plan.self) private var plan
    @State private var drawing: ProcedureDrawing?
    @State private var problem: String?

    private var pick: ProcedurePick? { plan.procedures.first { $0.ident == ident && $0.id == id } }

    var body: some View {
        List {
            if let drawing, let pick {
                let direct = plan.extras.procedureDirect["\(ident):\(id)"]
                Section {
                    ForEach(drawing.fixes.filter { !$0.missed }) { fix in
                        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                            HStack {
                                Text(fix.ident).font(.headline.monospaced())
                                if !fix.roles.isEmpty { Text(fix.roles.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary) }
                                Spacer()
                                if let own = plan.extras.crossings[fix.ident.uppercased()] {
                                    Text(Format.altitude(Double(own))).font(.subheadline.monospacedDigit()).foregroundStyle(.tint)
                                } else {
                                    switch Result(catching: { try fix.charted() }) {
                                    case .success(let charted?): Text(charted).font(.subheadline).foregroundStyle(.secondary)
                                    case .success(nil): EmptyView()
                                    case .failure: Text("Altitude not read").font(.subheadline).foregroundStyle(WingtipInk.caution)
                                    }
                                }
                            }
                            HStack {
                                Button(direct == fix.ident ? "Fly \(pick.name) as Charted" : "Direct To \(fix.ident)") {
                                    plan.setProcedureDirect(pick, fix: direct == fix.ident ? nil : fix.ident)
                                }
                                .glassButton()
                                Button("Cross at…") { flightUI.crossAt = fix.ident }
                                    .glassButton()
                            }
                        }
                    }
                }
            } else {
                Text(problem ?? "Fetching its fixes…").foregroundStyle(problem == nil ? Color.secondary : WingtipInk.problem)
            }
        }
        .navigationTitle(pick?.name ?? id)
        .task {
            guard let pick else { return }
            do { drawing = try await Planner.procedure(ident, id: id, transition: pick.transition) } catch { problem = error.localizedDescription }
        }
    }
}
