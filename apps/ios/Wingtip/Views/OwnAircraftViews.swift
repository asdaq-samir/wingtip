import SwiftUI

/// The figures, the flight plan's items and Save (the web app's form):
/// a new airplane in a sheet with Cancel and Add, one of the pilot's
/// with Save.
struct AircraftFormView: View {
    /// The altitude the cruise figures are the airplane's at, the engine's
    /// (AircraftForm.cruiseReferenceFt); a failure is said in the section.
    private static let cruiseReference = Result { try AircraftForm.cruiseReferenceFt() }

    let record: OwnAircraftRecord?
    var onSaved: (OwnAircraftRecord) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var form = AircraftForm()
    @State private var saving = false
    @State private var problem: String?
    @State private var tried = false
    /// The handbook's figures confirmed from a photographed page, saved
    /// with the airplane after its own Save (HandbookPhotoSection).
    @State private var handbook: GWHandbookFigures?
    @State private var added: OwnAircraftRecord?

    var body: some View {
        let problems = tried ? form.problems : [:]
        Form {
            Section {
                field("Tail number", text: $form.tailNumber, placeholder: "N12345", key: "tailNumber", problems: problems, codes: true)
                field("Type", text: $form.typeDesignator, placeholder: "C172", key: "typeDesignator", problems: problems, codes: true)
            }
            HandbookPhotoSection(form: $form, pending: $handbook, kept: record?.handbook)
            Section("True Airspeed") {
                number("Climb", unit: "kt", text: $form.climbTasKt, placeholder: "74", key: "climbTasKt", problems: problems)
                number("Cruise", unit: "kt", text: $form.cruiseTasKt, placeholder: "110", key: "cruiseTasKt", problems: problems)
            }
            // The descent as the POH gives it, indicated; the engine makes
            // it true at the descent's altitude (FAA-H-8083-25C ch. 8). Left
            // blank, the descent is flown on the cruise's figures and the
            // nav log says so.
            Section("Indicated Airspeed") {
                number("Descent", unit: "kt", text: $form.descentIasKt, placeholder: "110", key: "descentIasKt", problems: problems)
            }
            // Climb left blank climbs at the type's book figures.
            Section("Fuel Burn") {
                number("Climb", unit: "gph", text: $form.climbFuelBurnGph, placeholder: "11", key: "climbFuelBurnGph", problems: problems)
                number("Cruise", unit: "gph", text: $form.fuelBurnGph, placeholder: "8.5", key: "fuelBurnGph", problems: problems)
                number("Descent", unit: "gph", text: $form.descentFuelBurnGph, placeholder: "6", key: "descentFuelBurnGph", problems: problems)
            }
            // The cruise figures are the airplane's at this power at the
            // engine's reference altitude on a standard day, a row of its
            // handbook's cruise table (planning_figures' cruise_reference_ft).
            Section((try? Self.cruiseReference.get()).map { "Cruise figures at \(Format.altitude($0)), standard day" } ?? "Cruise figures, standard day") {
                ProblemLine(Self.cruiseReference, "The altitude these figures are at")
                number("Cruise power", unit: "%", text: $form.cruisePowerPct, placeholder: "65", key: "cruisePowerPct", problems: problems)
            }
            // Without usable fuel the nav log makes no fuel check.
            Section {
                number("Usable fuel", unit: "gal", text: $form.usableFuelGal, placeholder: "40", key: "usableFuelGal", problems: problems)
            }
            // FAA Form 7233-4's items (AIM Appendix 4): 10a equipment, 10b
            // surveillance, 19 colour and markings.
            Section("Flight Plan") {
                field("Equipment", text: $form.equipment, placeholder: "SDFGRY", key: "equipment", problems: problems, codes: true)
                field("Surveillance", text: $form.surveillance, placeholder: "B1", key: "surveillance", problems: problems, codes: true)
                field("Color", text: $form.colour, placeholder: "White, blue stripe", key: "colour", problems: problems, codes: false)
            }
            ProblemLine(problem ?? problems[AircraftForm.formKey])
        }
        .navigationTitle(record == nil ? "New Airplane" : "Edit Airplane")
        .toolbar {
            if record == nil {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(record == nil ? "Add" : "Save") { Task { await save() } }.disabled(saving)
            }
        }
        .onAppear { if let record, form == AircraftForm() { form = AircraftForm(record) } }
    }

    private func field(_ title: String, text: Binding<String>, placeholder: String, key: String, problems: [String: String], codes: Bool) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            LabeledContent(title) {
                TextField(placeholder, text: text)
                    .multilineTextAlignment(.trailing)
                    .textInputAutocapitalization(codes ? .characters : .sentences)
                    .autocorrectionDisabled(codes)
                    .font(codes ? .body.monospaced() : .body)
            }
            if let p = problems[key] { Text(p).font(.footnote).foregroundStyle(WingtipInk.problem) }
        }
    }

    private func number(_ title: String, unit: String, text: Binding<String>, placeholder: String, key: String, problems: [String: String]) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            LabeledContent(title) {
                HStack(spacing: WingtipSpace.xs) {
                    TextField(placeholder, text: text).multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                    Text(unit).foregroundStyle(.secondary)
                }
            }
            if let p = problems[key] { Text(p).font(.footnote).foregroundStyle(WingtipInk.problem) }
        }
    }

    private func save() async {
        tried = true
        guard let request = form.request else { return }
        saving = true
        defer { saving = false }
        do {
            var saved: OwnAircraftRecord
            // A new airplane added once is updated on a second Save, where
            // its handbook's figures failed after it went in.
            if let id = record?.id ?? added?.id { saved = try await Gateway.updateAircraft(id, request) } else { saved = try await Gateway.addAircraft(request) }
            added = record == nil ? saved : nil
            if let handbook {
                saved = try await Gateway.saveHandbook(saved.id, handbook)
                self.handbook = nil
            }
            problem = nil
            onSaved(saved)
            if record == nil { dismiss() }
        } catch {
            problem = error.localizedDescription
        }
    }
}

/// One of the pilot's airplanes: its figures to edit, its checklists
/// (normal and emergency, on this device) and squawks, its inspections and VOR check, and Delete.
struct OwnAircraftPage: View {
    @State var record: OwnAircraftRecord
    var onChange: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var askingDelete = false
    @State private var problem: String?

    static func figuresLine(_ a: OwnAircraftRecord) -> String {
        var line = "Cruise \(a.cruiseTasKt.formatted()) kt, \(a.fuelBurnGph.formatted()) gph"
        if let p = a.cruisePowerPct { line += " at \(p.formatted())%" }
        if let u = a.usableFuelGal { line += " · \(u.formatted()) gal usable" }
        return line
    }

    var body: some View {
        List {
            Section {
                NavigationLink {
                    AircraftFormView(record: record) { saved in record = saved; onChange() }
                } label: {
                    LabeledContent("Figures", value: Self.figuresLine(record)).lineLimit(2)
                }
                // Its checklists, kept on this device (LocalChecklists).
                ChecklistRows(airplane: record.tailNumber)
                NavigationLink {
                    SquawksView(aircraft: record) { Task { await reload() } }
                } label: {
                    LabeledContent("Squawks", value: record.openSquawks.isEmpty ? "" : "\(record.openSquawks.count) open")
                }
            }
            InspectionsSection(record: $record, onChange: onChange)
            VorCheckSection(record: $record, onChange: onChange)
            Section {
                Button("Delete Airplane", role: .destructive) { askingDelete = true }
            }
            ProblemLine(problem)
        }
        .navigationTitle(record.tailNumber)
        .confirmationDialog("Delete \(record.tailNumber)?", isPresented: $askingDelete, titleVisibility: .visible) {
            Button("Delete Airplane", role: .destructive) {
                Task {
                    do { try await Gateway.deleteAircraft(record.id); onChange(); dismiss() } catch { problem = error.localizedDescription }
                }
            }
        } message: {
            Text("It goes from your airplanes and from the nav log's picker. This can't be undone.")
        }
    }

    private func reload() async {
        do {
            if let fresh = try await Gateway.aircraftRecords().first(where: { $0.id == record.id }) { record = fresh }
        } catch {
            // Said here, so what is shown is not taken for what was just saved.
            problem = "Its record couldn't be fetched again: \(error.localizedDescription)"
        }
        onChange()
    }
}

/// The airplane's inspections and tests from its maintenance records,
/// each with the last day it is good for as the gateway works it out --
/// what the risk assessment reads for whether it may be flown. Saved
/// together.
struct InspectionsSection: View {
    @Binding var record: OwnAircraftRecord
    var onChange: () -> Void
    @State private var form = InspectionsRequest(nil)
    @State private var hoursAt = ""
    @State private var hoursNow = ""
    @State private var saving = false
    @State private var problem: String?
    @State private var loaded = false

    // The rule that asks for each: the annual, 12 calendar months, 14 CFR
    // 91.409(a); the altimeter and static, 24 calendar months for IFR,
    // 91.411; the transponder, 24 calendar months, 91.413; the ELT, 12
    // calendar months, 91.207(d).
    private var dated: [(title: String, rule: String, on: WritableKeyPath<InspectionsRequest, String?>, through: String?)] {
        let i = record.inspections
        return [
            ("Annual", "12 calendar months, 14 CFR 91.409(a)", \.annualOn, i.annualGoodThrough),
            ("Altimeter and static", "24 calendar months, for IFR, 91.411", \.staticCheckOn, i.staticCheckGoodThrough),
            ("Transponder", "24 calendar months, 91.413", \.transponderCheckOn, i.transponderCheckGoodThrough),
            ("ELT inspection", "12 calendar months, 91.207(d)", \.eltInspectedOn, i.eltInspectionGoodThrough),
        ]
    }

    var body: some View {
        // The 100-hour is owed only when the airplane is flown for hire, or
        // for instruction in it by the one who provides it (91.409(b)); the
        // ELT's not on a training flight within 50 nm (91.207(f)).
        Section("Inspections") {
            ForEach(dated, id: \.title) { d in
                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                    OptionalDayRow(title: d.title, day: Binding(get: { form[keyPath: d.on] }, set: { form[keyPath: d.on] = $0 }), upTo: Date())
                    HStack(spacing: WingtipSpace.xs) {
                        Text(d.rule)
                        if d.through != nil { Text("·"); StandingText(through: d.through) }
                    }
                    .font(.footnote).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                OptionalDayRow(title: "ELT battery replace by", day: $form.eltBatteryDueOn)
                HStack(spacing: WingtipSpace.xs) {
                    Text("As marked on the transmitter, 91.207(c)")
                    if let due = record.inspections.eltBatteryDueOn { Text("·"); StandingText(through: due, good: "By", past: "Due since") }
                }
                .font(.footnote).foregroundStyle(.secondary)
            }
            // Whether the 100-hour is owed at all (91.409(b)): only then is
            // it listed and reminded of.
            Toggle(isOn: Binding(get: { form.forHire ?? false }, set: { form.forHire = $0 })) {
                Text("Flown for hire")
                Text("Hire or instruction for hire: the 100-hour, 91.409(b)")
            }
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                LabeledContent("Hours at last 100-hour") {
                    TextField("0", text: $hoursAt).multilineTextAlignment(.trailing).keyboardType(.decimalPad)
                }
                Text(hundredHourLine).font(.footnote).foregroundStyle(.secondary)
            }
            LabeledContent("Hours now") {
                TextField("0", text: $hoursNow).multilineTextAlignment(.trailing).keyboardType(.decimalPad)
            }
            Button(saving ? "Saving…" : "Save Inspections") { Task { await save() } }.disabled(saving)
            ProblemLine(problem)
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            form = InspectionsRequest(record.inspections)
            hoursAt = record.inspections.hundredHourAtHours.map { String($0) } ?? ""
            hoursNow = record.inspections.hoursNow.map { String($0) } ?? ""
        }
    }

    /// The gateway's due hours, and how many are left by the hours recorded.
    private var hundredHourLine: String {
        guard form.forHire == true, let due = record.inspections.hundredHourDueAtHours else { return "Time in service, at the last annual or 100-hour" }
        var line = "Due at \(Format.hours(due))"
        if let now = record.inspections.hoursNow { line += now < due ? ", \(Format.hours(due - now)) to go" : ", due now" }
        return line
    }

    private func save() async {
        saving = true
        defer { saving = false }
        var request = form
        request.hundredHourAtHours = Double(hoursAt.trimmingCharacters(in: .whitespaces))
        request.hoursNow = Double(hoursNow.trimmingCharacters(in: .whitespaces))
        do { record = try await Gateway.saveInspections(record.id, request); problem = nil; onChange() } catch { problem = error.localizedDescription }
    }
}

/// The airplane's VOR check for IFR (14 CFR 91.171): the last one and the
/// day the gateway says it is good to, and the next recorded with the
/// date, kind, place and error 91.171(d) asks for.
struct VorCheckSection: View {
    @Binding var record: OwnAircraftRecord
    var onChange: () -> Void
    @State private var checkedOn = Date()
    @State private var kind = "VOT"
    @State private var place = ""
    @State private var errorText = ""
    @State private var saving = false
    @State private var problem: String?

    var body: some View {
        Section("VOR Check") {
            if let last = record.vorCheck {
                LabeledContent {
                    if !last.withinLimit {
                        Text("Over \(last.limitDeg.formatted())°").foregroundStyle(WingtipInk.problem)
                    } else {
                        StandingText(through: last.goodThrough, good: "To", past: "Ended")
                    }
                } label: {
                    Text("Last check")
                    Text([Day.said(last.checkedOn), VorCheckKind.label(last.kind), last.place, "\(last.errorDeg.formatted())°"].compactMap { $0 }.joined(separator: " · "))
                }
            } else {
                LabeledContent("Last check", value: "None recorded")
            }
            DatePicker("Checked on", selection: $checkedOn, in: ...Date(), displayedComponents: .date)
            Picker("How", selection: $kind) {
                ForEach(VorCheckKind.all, id: \.value) { k in Text((try? VorCheckKind.limitDeg(k.value)).map { "\(k.label) (±\($0.formatted())°)" } ?? k.label).tag(k.value) }
            }
            LabeledContent("Where") { TextField("KDLH VOT", text: $place).multilineTextAlignment(.trailing) }
            LabeledContent("Bearing error") {
                HStack(spacing: WingtipSpace.xs) {
                    TextField("0", text: $errorText).multilineTextAlignment(.trailing).keyboardType(.numbersAndPunctuation)
                    Text("°").foregroundStyle(.secondary)
                }
            }
            Button(saving ? "Recording…" : "Record Check") { Task { await recordCheck() } }.disabled(saving)
            ProblemLine(problem)
        }
    }

    private func recordCheck() async {
        saving = true
        defer { saving = false }
        let trimmed = place.trimmingCharacters(in: .whitespaces)
        let request = VorCheckRequest(checkedOn: Day.string(checkedOn), errorDeg: Double(errorText.trimmingCharacters(in: .whitespaces)) ?? 0,
                                      kind: kind, place: trimmed.isEmpty ? nil : trimmed)
        do { record = try await Gateway.recordVorCheck(record.id, request); problem = nil; onChange() } catch { problem = error.localizedDescription }
    }
}

private enum PreviewData {
    static let airplane = OwnAircraftRecord(climbFuelBurnGph: 11, climbTasKt: 76, colour: "White, blue stripe", createdAt: "2026-06-01", cruisePowerPct: 65, cruiseTasKt: 112, dueItems: [], equipment: "SDFGRY", figures: GWOwnFigures(glideRatio: 9, taxiFuelGal: 1.2), fuelBurnGph: 8.5, id: 4, inspections: Inspections(annualGoodThrough: "2027-06-30", annualOn: "2026-06-14", eltBatteryDueOn: "2028-02-01", eltInspectedOn: "2026-06-14", eltInspectionGoodThrough: "2027-06-30", forHire: false, hoursNow: 4312.4, hundredHourAtHours: 4280, hundredHourDueAtHours: 4380, staticCheckGoodThrough: "2027-03-31", staticCheckOn: "2025-03-02", transponderCheckGoodThrough: "2027-03-31", transponderCheckOn: "2025-03-02"), openSquawks: [Squawk(deferredFor: "VFR_DAY", id: 9, inoperative: true, reportedOn: "2026-10-30", text: "Left landing light out")], surveillance: "B1", tailNumber: "N3429J", typeDesignator: "P28A", usableFuelGal: 48, vorCheck: VorCheck(checkedOn: "2026-10-25", errorDeg: 2, goodThrough: "2026-11-24", kind: "VOT", limitDeg: 4, place: "KDLH VOT", withinLimit: true))
}

#Preview("AircraftFormView") {
    NavigationStack { AircraftFormView(record: nil) { _ in } }
}

#Preview("OwnAircraftPage") {
    NavigationStack { OwnAircraftPage(record: PreviewData.airplane) {} }
}

#Preview("OptionalDayRow") {
    @Previewable @State var day: String? = "2026-06-14"
    @Previewable @State var none: String? = nil
    List {
        OptionalDayRow(title: "Flight review", day: $day, upTo: Date())
        OptionalDayRow(title: "Medical expires", day: $none)
    }
}

#Preview("StandingText") {
    List {
        StandingText(through: "2027-06-30")
        StandingText(through: "2026-01-31")
        StandingText(through: "2028-02-01", good: "By", past: "Due since")
    }
}

#Preview("InspectionsSection") {
    @Previewable @State var record = PreviewData.airplane
    List { InspectionsSection(record: $record) {} }
}

#Preview("VorCheckSection") {
    @Previewable @State var record = PreviewData.airplane
    List { VorCheckSection(record: $record) {} }
}
