import SwiftUI
import UniformTypeIdentifiers

/// "To 19 Dec 2026" in green, or "Ended …" or "Not current" in red: a day
/// the gateway worked out, against today.
struct UntilText: View {
    let date: String?
    /// A currency still to come (instrument currency from approaches flown
    /// this month, 14 CFR 61.57(c)(1)): "From 1 Nov 2026" in orange, as the
    /// pilot is not current yet.
    var from: String? = nil

    var body: some View {
        let current = Day.current(date)
        if current, let from, from > Day.today() {
            Text("From \(Day.said(from))")
                .monospacedDigit()
                .foregroundStyle(Color.orange)
        } else {
            Text(date.map { current ? "To \(Day.said($0))" : "Ended \(Day.said($0))" } ?? "Not current")
                .monospacedDigit()
                .foregroundStyle(current ? Color.green : Color.red)
        }
    }
}

/// The pilot's logbook and their currency (the web app's LogbookPanel):
/// where they stand first -- passengers by day and at night (14 CFR
/// 61.57(a), (b)), the flight review (61.56) and the medical with the
/// dates they give, instrument currency (61.57(c), (d)) with the last
/// proficiency check -- all worked out by the gateway; then the totals,
/// the file in and out, and the flights, newest first, each opened to
/// change in its own row (LogbookEntriesModel) and swiped away with an Undo.
struct LogbookView: View {
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    /// The flights listed, the one open in its row and the one just deleted.
    @State private var flights = LogbookEntriesModel()
    @State private var currency: Currency?
    @State private var reminders: Reminders?
    @State private var problem: String?
    /// A new flight in the form, from the plus.
    @State private var adding: LogbookEntryRequest?
    @State private var importing = false
    @State private var imported: String?
    @State private var exportFile: URL?
    @State private var paperwork: Paperwork?
    /// A file read, shown before its flights go in.
    @State private var preview: (name: String, read: LogbookCSV.Imported)?
    @State private var sending = false

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in for your logbook", systemImage: "book.closed", description: Text("Your logbook and currency are kept with your account."))
            } else {
                comingUpSection
                currencySection
                instrumentSection
                if let currency, currency.flights > 0 {
                    Section(title: "Totals") {
                        LabeledContent("Total", value: Format.hours(currency.totalHours))
                        LabeledContent("Night", value: Format.hours(currency.nightHours))
                        LabeledContent("Cross-country", value: Format.hours(currency.crossCountryHours))
                        LabeledContent("Landings", value: "\(currency.landings)")
                    }
                }
                // A CSV file: ForeFlight's logbook export, or this logbook's
                // own; a flight already here is not added twice (the gateway's
                // same day, airplane, route and time).
                Section(title: "File") {
                    if let imported { Text(imported).font(.footnote).foregroundStyle(.secondary) }
                    if let preview {
                        previewRows(preview.name, preview.read)
                    } else {
                        Button { importing = true } label: { Label("Import a Logbook", systemImage: "square.and.arrow.down") }
                        if let exportFile { ShareLink(item: exportFile) { Label("Export as CSV", systemImage: "square.and.arrow.up") } }
                    }
                    LogbookPhotoRow { await load() }
                }
                Section(title: "Flights") {
                    if let removed = flights.removed {
                        UndoRow(words: "Removed \(LogbookEntriesModel.title(removed.entry))", undo: flights.undo,
                                done: { Task { await keep(removed.entry) } })
                    }
                    if let entries = flights.entries {
                        if entries.isEmpty { Text("No flights logged yet: the plus logs one.").foregroundStyle(.secondary) }
                        ForEach(entries) { e in
                            // Tapped, the flight opens in its row to change (Edit);
                            // its N-number, a tap of its own, opens the airplane's profile.
                            LogbookRow(entry: e) { if flights.editingID == e.id { flights.cancelEdit() } else { flights.edit(e) } }
                                .contextMenu {
                                    Button("Edit", systemImage: "pencil") { flights.edit(e) }
                                    Button("Delete", systemImage: "trash", role: .destructive) { delete(e) }
                                }
                                .swipeActions {
                                    Button("Delete", systemImage: "trash", role: .destructive) { delete(e) }
                                }
                            if flights.editingID == e.id { LogbookEntryEditRows(model: flights) { await load() } }
                        }
                    } else if problem == nil {
                        ProgressView()
                    }
                }
            }
            ProblemLine(problem)
        }
        .navigationTitle("Logbook")
        .glassScrollEdges()
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if session.signedIn {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = .blank(aircraft: plan.tail) } label: { Label("Log a Flight", systemImage: "plus") }
                }
            }
        }
        .sheet(isPresented: Binding(get: { adding != nil }, set: { if !$0 { adding = nil } })) {
            NavigationStack {
                LogbookEntryForm(entry: adding ?? .blank(aircraft: plan.tail), isNew: true) { saved in
                    try await Gateway.addLogbookEntry(saved)
                    await load()
                }
            }
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.commaSeparatedText, .plainText]) { result in
            Task { await bringIn(result) }
        }
        .task(id: session.signedIn) { await load() }
        .refreshable { await load() }
        // Left with an Undo still up: the delete kept.
        .onDisappear { if let removed = flights.removed { Task { await keep(removed.entry) } } }
    }

    // What falls due, the pilot's and their airplanes', soonest first, each
    // with its rule (14 CFR 61.56(c), 61.23, 61.57; 91.409, 91.207, 91.411,
    // 91.413, 91.171; an AD's own number) and the days or hours left: the
    // gateway's list, the one the reminder emails are made from.
    @ViewBuilder private var comingUpSection: some View {
        if let items = paperwork?.items {
            Section(title: "Coming Up") {
                if items.isEmpty {
                    Text("Nothing dated yet: your flight review, medical and airplanes' inspections show here once given.")
                        .foregroundStyle(.secondary)
                }
                ForEach(items, id: \.key) { d in
                    LabeledContent {
                        Text(d.when).monospacedDigit().foregroundStyle(d.tone)
                    } label: {
                        Text(d.named)
                        Text([d.rule, d.dueOn.map(Day.said)].compactMap { $0 }.joined(separator: " · "))
                    }
                }
            }
        }
    }

    /// The flights a file gave, before they go in: how many, the first few,
    /// the rows left out with their lines and why.
    @ViewBuilder private func previewRows(_ name: String, _ read: LogbookCSV.Imported) -> some View {
        let n = read.entries.count
        Text("\(name): \(n) flight\(n == 1 ? "" : "s") read\(read.skipped.isEmpty ? "" : ", \(read.skipped.count) row\(read.skipped.count == 1 ? "" : "s") left out").")
            .font(.footnote).foregroundStyle(.secondary)
        ForEach(Array(read.entries.prefix(5).enumerated()), id: \.offset) { _, e in
            LabeledContent {
                Text(Format.hours(e.totalHours)).monospacedDigit()
            } label: {
                Text(Day.said(e.flownOn) + (e.route.map { " · \($0)" } ?? ""))
                Text([e.aircraft, e.aircraftType].compactMap { $0 }.joined(separator: " · "))
            }
        }
        if n > 5 { Text("And \(n - 5) more").font(.footnote).foregroundStyle(.secondary) }
        ForEach(read.skipped.prefix(3), id: \.line) { s in
            Text("Line \(s.line): \(s.reason)").font(.footnote).foregroundStyle(.secondary)
        }
        Button(sending ? "Importing…" : "Import \(n) Flight\(n == 1 ? "" : "s")") { Task { await send(read) } }
            .disabled(sending || n == 0)
        Button("Cancel", role: .cancel) { preview = nil }
    }

    // From the logbook and the dates the pilot gives, no one's sign-off:
    // 61.57(a) counts takeoffs and landings in the same category and class
    // in 90 days; (b) at night, to a full stop; 61.56(c) the flight review
    // within 24 calendar months.
    @ViewBuilder private var currencySection: some View {
        Section(title: "Currency") {
            LabeledContent {
                UntilText(date: currency?.dayPassengersUntil)
            } label: {
                Text("Passengers by day")
                Text("3 takeoffs and landings in 90 days")
            }
            LabeledContent {
                UntilText(date: currency?.nightPassengersUntil)
            } label: {
                Text("Passengers at night")
                Text("3 to a full stop at night in 90 days")
            }
            VStack(alignment: .leading, spacing: 2) {
                OptionalDayRow(title: "Flight review", day: dateBinding(\.flightReviewOn), upTo: Date())
                if let until = currency?.flightReviewUntil { UntilText(date: until).font(.footnote) } else {
                    Text("Within 24 calendar months").font(.footnote).foregroundStyle(.secondary)
                }
            }
            VStack(alignment: .leading, spacing: 2) {
                OptionalDayRow(title: "Medical expires", day: dateBinding(\.medicalExpiresOn))
                if let on = currency?.medicalExpiresOn { UntilText(date: on).font(.footnote) } else {
                    Text("The day it expires").font(.footnote).foregroundStyle(.secondary)
                }
            }
            Toggle(isOn: Binding(get: { reminders?.on ?? false }, set: { on in Task { await remind(on) } })) {
                Text("Email reminders")
                Text("30 and 7 days before each runs out, your airplanes' too")
            }
            .disabled(reminders == nil)
        }
    }

    // 14 CFR 61.57(c): six approaches, holding and tracking in the 6
    // calendar months before the month flown; more than six months past,
    // only an instrument proficiency check restores it (61.57(d)). The
    // gateway counts both.
    @ViewBuilder private var instrumentSection: some View {
        Section(title: "Instrument") {
            LabeledContent {
                if let after = currency?.ipcNeededAfter, after < Day.today() {
                    Text("IPC needed").foregroundStyle(.red)
                } else {
                    UntilText(date: currency?.instrumentCurrentUntil, from: currency?.instrumentCurrentFrom)
                }
            } label: {
                Text("Instrument currency")
                Text("\(currency?.approachesInWindow ?? 0) of 6 approaches\(currency?.holdingInWindow == true ? ", holding" : "")\(currency?.trackingInWindow == true ? ", tracking" : "") in the window")
            }
            OptionalDayRow(title: "Proficiency check", day: dateBinding(\.ipcOn), upTo: Date())
        }
    }

    /// One of the dates the pilot gives, saved as it changes, the others
    /// sent as they stand.
    private func dateBinding(_ key: WritableKeyPath<CurrencyDatesRequest, String?>) -> Binding<String?> {
        let now = CurrencyDatesRequest(flightReviewOn: currency?.flightReviewOn, ipcOn: currency?.ipcOn, medicalExpiresOn: currency?.medicalExpiresOn)
        return Binding(get: { now[keyPath: key] }, set: { value in
            var next = now
            next[keyPath: key] = value
            Task {
                do { currency = try await Gateway.setCurrencyDates(next) } catch { problem = error.localizedDescription }
            }
        })
    }

    /// Off the list at once; any earlier delete's Undo gone with it, and kept.
    private func delete(_ e: LogbookEntry) {
        if let earlier = flights.delete(e) { Task { await keep(earlier) } }
    }

    /// The delete sent once its Undo is gone, then the currency worked out again without it.
    private func keep(_ e: LogbookEntry) async {
        if let failed = await flights.keep(e) { problem = failed }
        await load()
    }

    private func remind(_ on: Bool) async {
        do { reminders = try await Gateway.setReminders(on) } catch { problem = error.localizedDescription }
    }

    private func load() async {
        guard session.signedIn else { flights.entries = nil; currency = nil; return }
        do {
            let list = try await Gateway.logbook()
            // A flight whose Undo is still up stays off the list.
            flights.entries = list.filter { $0.id != flights.removed?.entry.id }
            currency = try await Gateway.currency()
            reminders = try? await Gateway.reminders()
            paperwork = try? await Gateway.paperwork()
            problem = nil
            do { exportFile = try Self.write(list) } catch {
                exportFile = nil
                problem = "Your logbook's CSV could not be written: \(error.localizedDescription)"
            }
        } catch { problem = "Your logbook could not be fetched: \(error.localizedDescription)" }
    }

    /// The logbook as a file to share, named for today.
    private static func write(_ entries: [LogbookEntry]) throws -> URL? {
        guard !entries.isEmpty else { return nil }
        let url = FileManager.default.temporaryDirectory.appending(path: "logbook-\(Day.today()).csv")
        try LogbookCSV.csv(entries).write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    /// A CSV picked in Files: read on the phone (LogbookCSV) and shown
    /// before anything is sent.
    private func bringIn(_ result: Result<URL, any Error>) async {
        do {
            let url = try result.get()
            let opened = url.startAccessingSecurityScopedResource()
            defer { if opened { url.stopAccessingSecurityScopedResource() } }
            let text = try String(contentsOf: url, encoding: .utf8)
            imported = nil
            preview = (url.lastPathComponent, try LogbookCSV.read(text))
        } catch {
            problem = "Could not import the logbook: \(error.localizedDescription)"
        }
    }

    /// The flights shown, sent; what was left out said in a line.
    private func send(_ read: LogbookCSV.Imported) async {
        sending = true
        defer { sending = false }
        do {
            let answer = try await Gateway.importLogbook(read.entries)
            imported = LogbookCSV.summary(read, answer)
            preview = nil
            await load()
        } catch {
            problem = "Could not import the logbook: \(error.localizedDescription)"
        }
    }
}

#Preview("UntilText") {
    List {
        UntilText(date: "2027-06-30")
        UntilText(date: "2026-01-31")
        UntilText(date: nil)
    }
}

#Preview("LogbookView") {
    // Signed out, the logbook asks for the account; its entries come
    // from the gateway once signed in.
    NavigationStack { LogbookView() }
        .environment(Session())
        .environment(Plan())
}
