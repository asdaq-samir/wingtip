import SwiftUI

/// The clearance step, one card as the owner's canvas draws it
/// (2026-11-03): its four parts in a row (Hear, Read back, Enter,
/// Compare), the clearance heard laid out as CRAFT (cleared to, route,
/// altitude, frequency, transponder; AIM 4-4-3 lists what a clearance
/// holds, in that order), the pilot's read back checked line by line by
/// the engine (ReadbackCheck), the route cleared against the one filed
/// (ClearanceCompare), and two buttons: Enter the route, which puts the
/// route in the plan with the expected altitude (else the one to
/// maintain) flown, and Read back again, which listens for the pilot's
/// read back. The raw transcript, typed or heard, folds under them.
/// Nothing heard changes the plan before Enter.
struct ClearanceSheet: View {
    @Environment(ClearanceListener.self) private var listener
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(\.look) private var look
    /// The words read: the newest transmission settled while listening,
    /// until the pilot picks one from the log or types.
    @State private var text = ""
    @State private var following = true
    @State private var lookup = ClearanceLookup()
    private var words: [String] { lookup.words }
    private var found: ClearancePlaces? { lookup.found }
    private var foundFor: String? { lookup.foundFor }
    /// The pilot's read back: the first transmission settled after Read
    /// back again was tapped, or typed in the transcript.
    @State private var readback = ""
    @State private var readingBack = false
    /// The newest transmission's id when Read back again was tapped: the
    /// next one settled is the read back, not a new clearance.
    @State private var readbackAfter = -1
    @State private var transcriptOpen = false
    /// The clearance's field while the pilot types in it: it stays where it
    /// is until they leave it, rather than folding into the transcript as
    /// soon as the first words read as a clearance and taking the keyboard
    /// with it mid-word.
    @FocusState private var typing: Bool
    @State private var askingCancel = false
    /// Words heard or typed, or a read back: Cancel asks before they go.
    private var edited: Bool { !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !readback.isEmpty }

    /// The route's ends and the pilot's position, to look near.
    private var nearPoints: [(Double, Double)] {
        var points: [(Double, Double)] = []
        if let course = plan.course {
            points += [(course.departure.lat, course.departure.lon), (course.destination.lat, course.destination.lon)]
        }
        if let fix = ownShip.fix { points.append((fix.coordinate.latitude, fix.coordinate.longitude)) }
        return points
    }

    /// The same, as the planner's `near`.
    private var near: String {
        nearPoints.map { String(format: "%.4f,%.4f", $0.0, $0.1) }.joined(separator: ";")
    }

    /// The clearance as read; a refusal is said under the steps.
    private var reading: Result<Clearance, any Error> { Result { try Clearance.read(text) } }
    private var clearance: Clearance { (try? reading.get()) ?? Clearance() }

    private var wantsPlaces: Bool {
        let asked = clearance.asked(near: "", dep: "", dest: "")
        return asked.limit != nil || !(asked.route ?? []).isEmpty || asked.departure != nil || asked.arrival != nil
    }

    private var ready: Bool {
        clearance.heardAny && (!wantsPlaces || foundFor == text)
    }

    /// The route the clearance gives from the one planned, once its
    /// places are found.
    /// The route as planned where the engine cannot answer, and why in
    /// `engineProblem`.
    private var clearing: Result<(dep: String, stops: [String], dest: String, typed: [Clearance.Typed]), any Error> {
        Result { try Clearance.clearedRoute(text, found ?? ClearancePlaces(), dep: plan.dep, stops: plan.stops, dest: plan.dest) }
    }
    private var cleared: (dep: String, stops: [String], dest: String, typed: [Clearance.Typed]) {
        (try? clearing.get()) ?? (plan.dep, plan.stops, plan.dest, [])
    }

    private var checking: Result<ReadbackCheck, any Error>? {
        readback.isEmpty ? nil : Result { try ReadbackCheck.check(cleared: text, said: readback) }
    }
    private var check: ReadbackCheck? { try? checking?.get() }

    /// What the engine could not read of the clearance, the route it gives
    /// or the read back, said beside the listener's own problems.
    private var engineProblem: String? {
        let failures: [(String, (any Error)?)] = [
            ("The clearance", { if case .failure(let e) = reading { e } else { nil } }()),
            ("The route it gives", { if case .failure(let e) = clearing { e } else { nil } }()),
            ("The read back", { if case .failure(let e)? = checking { e } else { nil } }()),
        ]
        return failures.compactMap { what, e in e.map { "\(what) couldn't be read: \($0.localizedDescription)" } }.first
    }

    /// When the clearance shown was heard, where it came off the radio.
    private var heardAt: Date? {
        listener.heard.last { $0.final && $0.text == text }?.at
    }

    var body: some View {
        let clearance = clearance
        Form {
            Section {
                ClearanceStepsRow(heard: clearance.heardAny, readBack: !readback.isEmpty, ready: ready)
                if !clearance.heardAny || typing {
                    heardField
                }
                if let problem = listener.problem ?? lookup.problem ?? lookup.wordsProblem ?? engineProblem {
                    ProblemLine(problem)
                }
            } header: {
                // The flight the clearance is for, as the canvas heads it.
                Text([plan.dep.isEmpty ? nil : "\(plan.dep) → \(plan.dest)", "IFR", plan.tail].compactMap { $0 }.joined(separator: " · "))
            }
            if clearance.heardAny {
                ClearanceCraftSection(clearance: clearance, found: found, heardAt: heardAt)
                ClearanceReadbackSection(clearance: clearance, readback: readback, readingBack: readingBack, check: check)
                if ready {
                    let cleared = cleared
                    let difference = ClearanceCompare.describe(plannedStops: plan.stops, plannedDest: plan.dest,
                                                               clearedStops: cleared.stops, clearedDest: cleared.dest, typed: cleared.typed)
                    ClearanceCompareSection(difference: difference)
                }
                Section {
                    HStack(spacing: WingtipSpace.md) {
                        Button("Enter the route") { enter() }
                            .glassProminentButton()
                            .disabled(!ready)
                        if listener.canListen { Button("Read back again") { readBackAgain() }.glassButton() }
                    }
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section {
                    DisclosureGroup("Transcript", isExpanded: $transcriptOpen) {
                        if !typing { heardField }
                        TextField("Your read back, as said", text: $readback, axis: .vertical)
                            .lineLimit(2...6)
                        heardLog
                    }
                }
            } else {
                Section { heardLog }
            }
        }
        .navigationTitle("Clearance")
        .navigationBarTitleDisplayMode(.inline)
        // A swipe down asks through Cancel once something is heard or typed.
        .formGuard(edited: edited)
        .toolbar {
            // Cancel throws away what was heard here, the plan untouched
            // (HIG Sheets: Cancel leading, Done trailing); listening goes
            // on with the sheet put away: the captions over the map carry
            // it, and Stop ends it.
            FormCancel(edited: edited, cancel: { nav.finish(.clearance) }, asking: $askingCancel)
            // Done enters the route, as Enter the route does: nothing
            // heard reaches the plan before one of them.
            ToolbarItem(placement: .confirmationAction) { Button("Done") { enter() }.disabled(!ready) }
            if listener.canListen { // speech recognised on the iPhone, else no Listen or Read back: typed
                ToolbarItem(placement: .bottomBar) {
                    Button {
                        if listener.listening { listener.stop() } else { following = true; Task { await listener.start(words: words) } }
                    } label: {
                        Label(listener.listening ? "Stop" : "Listen", systemImage: listener.listening ? "stop.circle.fill" : WingtipIcon.radio)
                    }
                    .glassProminentButton()
                }
            }
        }
        .task {
            await lookup.loadWords(near: near, dep: plan.dep)
        }
        // A clearance read in full is felt as a success; one with a
        // place the reader is unsure of, as a warning, once each. In
        // Native (Look.isStock) only the warning, which carries meaning.
        .sensoryFeedback(.success, trigger: ready) { was, now in !look.isStock && !was && now }
        .sensoryFeedback(.warning, trigger: ClearanceCraftSection.unsure(found)) { was, now in !was && now }
        .onAppear { if let given = listener.sheetText { text = given; following = false } }
        .onChange(of: listener.heard.last(where: \.final)?.text) { _, newest in
            guard let newest else { return }
            if readingBack, let last = listener.heard.last(where: \.final), last.id > readbackAfter {
                readback = newest
                readingBack = false
            } else if following {
                text = newest
            }
        }
        .task(id: text) {
            // Once the words stop changing, their places looked up.
            guard wantsPlaces else { return }
            let heard = text
            try? await Task.sleep(for: .milliseconds(400))
            guard !Task.isCancelled else { return }
            await lookup.lookUp(heard, near: near, nearPoints: nearPoints, dep: plan.dep, stops: plan.stops, dest: plan.dest)
        }
    }

    /// The clearance's words, to type or to read as heard.
    @ViewBuilder private var heardField: some View {
        TextField("Tap Listen and hold the phone to the speaker, or type the clearance.",
                  text: Binding(get: { text }, set: { text = $0; following = false }), axis: .vertical).lineLimit(3...6)
            .focused($typing)
        ClearancePhotoRow { said in text = said; following = false }
        // The words said in full by the on-device model, where the engine
        // reads more from them (ClearanceInFull); in only on the tap.
        ClearanceInFullRow(text: text) { said in text = said; following = false }
    }

    /// The radio as heard, newest first: a tap reads that one above.
    private var heardLog: some View {
        ClearanceHeardLog(heard: listener.heard) { picked in
            text = picked
            following = false
        }
    }

    /// Listens for the pilot's read back: the next transmission settled
    /// is it, the clearance shown kept as it is.
    private func readBackAgain() {
        following = false
        readback = ""
        readingBack = true
        readbackAfter = listener.heard.last?.id ?? -1
        // The radio already listened to gives the next transmission
        // (onChange above); otherwise the microphone opens for this one
        // read back alone, kept out of the radio's log.
        if !listener.listening {
            Task {
                let said = await listener.hearOnce(words: words)
                if readingBack { readback = said ?? ""; readingBack = false }
            }
        }
    }

    private func enter() {
        let clearance = clearance
        let cleared = cleared
        plan.dest = cleared.dest
        plan.stops = cleared.stops
        for typed in cleared.typed {
            let departure = typed.name == found?.departure?.id
            let field = departure ? cleared.dep : cleared.dest
            let kind = departure ? "departure" : "arrival"
            plan.procedures.removeAll { $0.ident == field && $0.kind == kind }
            plan.procedures.append(ProcedurePick(ident: field, id: typed.name, kind: kind, name: typed.name,
                                                 transition: departure ? typed.after : typed.before))
        }
        if !clearance.vfr, let ft = clearance.expectFt ?? clearance.maintainFt {
            plan.ownAltitudeFt = Double(ft)
            plan.ownAltitudeLegal = false
        }
        plan.plan()
        nav.finish(.clearance)
    }
}

#Preview("ClearanceSheet") {
    NavigationStack { ClearanceSheet() }
        .environment(Plan())
        .environment(OwnShip())
}
