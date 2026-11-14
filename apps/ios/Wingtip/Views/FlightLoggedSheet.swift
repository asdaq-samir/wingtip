import SwiftUI

/// "Flight Logged" (the web's FlightLoggedSheet): the entry the engine
/// drew from the flight's track, each figure changeable with its reason
/// under it, for the pilot to Log (never saved unasked), put off until
/// Later, or let go as Not a Flight to Log; then what was logged.
struct FlightLoggedSheet: View {
    @Bindable var model: AutoLogbook
    let signedIn: Bool
    let logbookChanged: () -> Void

    var body: some View {
        Form {
            if let logged = model.logged {
                Section {
                    Text("\(logged.route ?? "") · \(Format.hours(logged.totalHours)), in your logbook; your currency is worked out again from it.")
                    if let problem = model.trackProblem {
                        // Where the logged flight shows, the error where it happened.
                        ProblemLine("The track couldn't be sent to the saved flight: \(problem). It's kept on this iPhone and sent when you're next online.")
                        Button("Try Again") { Task { await model.sendUnsent() } }
                    } else if logged.flightId != nil {
                        Text("The track is with the saved flight too: its debrief is there in Flights.")
                    }
                }
            } else {
                draftSections
            }
        }
        .navigationTitle("Flight Logged")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbar }
        .interactiveDismissDisabled(model.logging)
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        if model.logged != nil {
            ToolbarItem(placement: .confirmationAction) { Button("Done") { model.close() } }
        } else {
            ToolbarItem(placement: .cancellationAction) { Button("Later") { model.later() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("Log") { Task { await model.log(logbookChanged: logbookChanged) } }
                    .disabled(model.draft == nil || model.logging)
            }
        }
    }

    @ViewBuilder private var draftSections: some View {
        Section {
            Text("Drawn from this flight's track. Change anything, then Log it.").foregroundStyle(.secondary)
            if !signedIn { Text("Sign in to log it: the track is kept on this phone until then.") }
            if model.drafting { ProgressView("Drawing the entry from the track…") }
            if let problem = model.draftProblem { ProblemLine("The entry could not be drawn: \(problem)") }
        }
        if let draft = model.draft {
            DraftRows(model: model, draft: draft)
        }
        if let problem = model.logProblem { Section { ProblemLine("It could not be logged: \(problem)") } }
        Section {
            Button("Not a Flight to Log", role: .destructive) { model.discard() }
        }
    }
}

/// The draft's figures, each the pilot's to change, the engine's reason
/// for it under it.
private struct DraftRows: View {
    @Bindable var model: AutoLogbook
    let draft: AutoLogbook.Draft

    private func why(_ item: String) -> String? {
        let said = draft.reasons.filter { $0.item == item }
        return said.isEmpty ? nil : said.map { "\($0.says) (\($0.source))" }.joined(separator: " ")
    }

    var body: some View {
        let e = draft.entry
        Section("Flight") {
            text("Date", \.flownOn, e.flownOn, why: why("flownOn"))
            text("Airplane", \.aircraft, e.aircraft ?? "", why: nil)
            text("Route", \.route, e.route, why: why("distanceNm"))
        }
        Section("Time") {
            hours("Total", \.totalHours, e.totalHours, why: why("totalHours"))
            row("In the Air", value: Format.hours(e.airHours), why: why("airHours"))
            hours("Night", \.nightHours, e.nightHours, why: why("nightHours"))
            hours("Cross-Country", \.crossCountryHours, e.crossCountryHours, why: why("crossCountryHours"))
        }
        Section("Landings") {
            count("Day", \.dayLandings, e.dayLandings, why: why("landing"))
            count("Night, Full Stop", \.nightLandings, e.nightLandings, why: nil)
        }
        if !draft.approaches.isEmpty || !draft.holds.isEmpty {
            Section("Instrument") {
                Toggle(isOn: $model.byInstruments) {
                    VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                        Text("Flown by Instruments")
                        let said = ["approaches", "holding", "tracking"].compactMap(why).joined(separator: " ")
                        Text("\(draft.instrument.approaches) approaches\(draft.instrument.holding ? ", a hold" : ""). \(said)")
                            .font(WingtipType.note).foregroundStyle(.secondary)
                    }
                }
            }
        }
        Section("Remarks") {
            TextField("Remarks", text: Binding(get: { model.edits.remarks ?? e.remarks }, set: { model.edits.remarks = $0 }), axis: .vertical)
                .lineLimit(1...4)
            // A remark drafted from the track and the entry, into the field
            // to edit; logged only with Log.
            DraftRemarkButton(figures: {
                RemarkDraft.figures(draft, entry: AutoLogbook.entryRequest(draft, edits: model.edits, byInstruments: model.byInstruments, flightId: nil))
            }) { model.edits.remarks = $0 }
        }
        if !model.flights.isEmpty {
            Section("Debrief Against") {
                Picker("Saved flight", selection: Binding(get: { model.linked }, set: { model.picked = .some($0) })) {
                    Text("No Saved Flight").tag(Int?.none)
                    ForEach(model.flights.prefix(5)) { f in
                        Text(([f.departureIdent] + f.stops + [f.destinationIdent]).joined(separator: " ")).tag(Int?.some(f.id))
                    }
                }
                .pickerStyle(.inline)
                .labelsHidden()
            }
        }
    }

    private func row(_ title: String, value: String, why: String?) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(title, value: value)
            if let why { Text(why).font(WingtipType.note).foregroundStyle(.secondary) }
        }
    }

    private func text(_ title: String, _ key: WritableKeyPath<AutoLogbook.Edits, String?>, _ drafted: String, why: String?) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(title) {
                TextField(title, text: Binding(get: { model.edits[keyPath: key] ?? drafted }, set: { model.edits[keyPath: key] = $0 }))
                    .multilineTextAlignment(.trailing)
            }
            if let why { Text(why).font(WingtipType.note).foregroundStyle(.secondary) }
        }
    }

    private func hours(_ title: String, _ key: WritableKeyPath<AutoLogbook.Edits, Double?>, _ drafted: Double, why: String?) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(title) {
                TextField(title, value: Binding(get: { model.edits[keyPath: key] ?? drafted }, set: { model.edits[keyPath: key] = max(0, $0) }),
                          format: .number.precision(.fractionLength(0...1)))
                    .keyboardType(.decimalPad).multilineTextAlignment(.trailing)
            }
            if let why { Text(why).font(WingtipType.note).foregroundStyle(.secondary) }
        }
    }

    private func count(_ title: String, _ key: WritableKeyPath<AutoLogbook.Edits, Int?>, _ drafted: Int, why: String?) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            LabeledContent(title) {
                TextField(title, value: Binding(get: { model.edits[keyPath: key] ?? drafted }, set: { model.edits[keyPath: key] = max(0, $0) }), format: .number)
                    .keyboardType(.numberPad).multilineTextAlignment(.trailing)
            }
            if let why { Text(why).font(WingtipType.note).foregroundStyle(.secondary) }
        }
    }
}

/// The flight just ended, drawn into a logbook entry wherever the app is
/// (RootView's one line); its card, Flight Logged, opens when the draft
/// is asked for (CardTriggers).
struct AutoLogbookHost: ViewModifier {
    @Environment(AutoLogbook.self) private var model
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan

    func body(content: Content) -> some View {
        content
            .task(id: "\(model.recorder.endedAt ?? 0)|\(session.signedIn)") {
                await model.draw(signedIn: session.signedIn, tail: plan.tail, type: plan.stockType)
            }
    }
}

/// Flight Logged as a card: the model, the sign-in and the logbook's
/// change handed to the form.
struct FlightLoggedCard: View {
    @Environment(AutoLogbook.self) private var logbook
    @Environment(Session.self) private var session
    @Environment(Verdict.self) private var verdict

    var body: some View {
        FlightLoggedSheet(model: logbook, signedIn: session.signedIn) { verdict.logbookChanged() }
    }
}
