import SwiftUI

/// NOTAMs as a list of their own (docs/design/ios.md §6): the route's,
/// opened from the Brief, or one field's, opened from its card
/// (/api/airport/{ident}/notams). A large title, sections by place, each
/// row a badge for its kind, the NOTAM in sentence case (the engine's
/// faa_words) and its times in Zulu; a row pushes the NOTAM as sent. Every
/// NOTAM in the engine's order (notams_ranked), nothing ranked, filtered or
/// sorted here, and no search field: the app keeps one search (the owner,
/// 2026-11-13: "I don't want search notams"; rules.md 1.5).
struct NotamListView: View {
    @Environment(ReadyToFly.self) private var ready
    let source: NotamSource
    @Environment(Plan.self) private var plan
    @State private var ranked: APINotamsRanked?
    /// Whether each runs until the charts are updated, read once with the
    /// list (FieldNotamWords.untilCharts), never by a row as it is drawn.
    @State private var untilCharts: [String: Bool] = [:]
    @State private var problem: String?

    var body: some View {
        List {
            if let ranked {
                let shown = NotamRows.inOrder(ranked.notams)
                if ranked.unchecked?.contains("tfrs") == true {
                    Section { ProblemLine(Wording.tfrsNotChecked) }
                }
                ForEach(NotamRows.places(shown, source: source), id: \.title) { place in
                    Section {
                        ForEach(place.notams, id: \.id) { notam in
                            let charts = untilCharts[notam.id]
                            NavigationLink { NotamDetailView(notam: notam, untilCharts: charts) } label: { NotamRow(notam: notam, untilCharts: charts) }
                        }
                    } header: {
                        Text("\(place.title) · \(place.notams.count)")
                    }
                }
                if shown.isEmpty {
                    ContentUnavailableView("No NOTAMs", systemImage: "checkmark.bubble", description: Text(source.noneWords))
                }
                // Not the full set until the planner holds it (decision 0059).
                Section {
                    Text(NotamCoverage.line(since: ranked.coverageSince, full: ranked.fullSet ?? false))
                        .font(WingtipType.note).foregroundStyle(ranked.fullSet == true ? .secondary : WingtipInk.caution)
                }
            } else if let problem {
                Section { ProblemLine(problem) }
            } else {
                Section {
                    ForEach(0..<4, id: \.self) { _ in
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            Text("The NOTAM's subject").font(.headline)
                            Text("What it says and until when, in plain words").font(.subheadline).foregroundStyle(.secondary)
                        }
                        .loading(Wording.fetchingNotams)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(source.title)
        .navigationBarTitleDisplayMode(.large)
        .task(id: source) { await load(force: false) }
    }

    private func load(force: Bool) async {
        switch source {
        case .route:
            let model = ready
            await model.fetchNotams(force: force)
            // Read once: the model may fetch again across the await, and the
            // rows must be the ones untilCharts was read for.
            let fresh = model.notams
            untilCharts = await FieldNotamWords.untilCharts(fresh?.notams ?? [])
            ranked = fresh
            problem = model.notamsProblem ?? (plan.routed ? nil : "Plan a route to see its NOTAMs.")
        case .field(let ident):
            do {
                let fresh = try await KeptForAir.answer(.notams, key: "field:\(ident)") { try await Planner.notams(ident) }.value
                untilCharts = await FieldNotamWords.untilCharts(fresh.notams)
                ranked = fresh
                problem = nil
            } catch {
                problem = Problems.say("\(ident)'s NOTAMs could not be fetched", error)
            }
        }
    }
}

/// Whose NOTAMs a list shows.
enum NotamSource: Hashable {
    case route
    case field(String)

    var title: String {
        switch self {
        case .route: "NOTAMs"
        case .field(let ident): "\(ident) NOTAMs"
        }
    }

    var noneWords: String {
        switch self {
        case .route: "The feed has none for the route."
        case .field(let ident): "The feed has none for \(ident), and no TFR is within 5 nm."
        }
    }
}

/// The list's order and sections and each row's words, apart from the view
/// so the tests read them (NativeLookTests).
enum NotamRows {
    struct Place {
        let title: String
        let notams: [APIRankedNotam]
    }

    /// Every NOTAM in the engine's order (its rank, notams_ranked).
    static func inOrder(_ notams: [APIRankedNotam]) -> [APIRankedNotam] {
        notams.sorted { $0.rank < $1.rank }
    }

    /// The NOTAM's kind as its badge says it: the FAA keyword ("RWY",
    /// "AD", "NAV"), "TFR", or "NOTAM" where the feed gave none.
    static func kind(_ notam: APIRankedNotam) -> String {
        notam.kind == "tfr" ? "TFR" : (notam.keyword?.uppercased() ?? "NOTAM")
    }

    /// Sections by place, in the order their first NOTAM comes: the
    /// field's ident, or TFRs for the temporary flight restrictions.
    static func places(_ notams: [APIRankedNotam], source: NotamSource) -> [Place] {
        var order: [String] = []
        var by: [String: [APIRankedNotam]] = [:]
        for notam in notams {
            let title = notam.kind == "tfr" ? "TFRs" : (notam.field ?? "En Route")
            if by[title] == nil { order.append(title) }
            by[title, default: []].append(notam)
        }
        return order.map { Place(title: $0, notams: by[$0] ?? []) }
    }

    /// "In effect now", "From 11/09 14:00 UTC", or the span, from the
    /// NOTAM's own times; the engine says whether it is in force. The
    /// route's list knows no field's zone, so UTC, said so, never a bare Z
    /// (the owner, 2026-11-23; FieldNotamWords.when). Where the engine's
    /// notam_card says it runs until the charts are updated (`untilCharts`:
    /// PERM with an EST end or none, JO 7930.2 4-2-1), its end is
    /// "permanent", never the EST date (the owner, 2026-11-23: "For a
    /// permanent, just say permanent"), as on the field's list. Where the
    /// card could not be read (nil, an engine error), no end is said at
    /// all, never a firm date that may only be the estimate
    /// nor "estimated", which the owner ruled out: "In effect now" or
    /// "From …", and one not in force with no start "Not in
    /// effect", never a blank line. `untilCharts` has no
    /// default, so a new caller cannot drop every end by leaving it out.
    static func when(_ notam: APIRankedNotam, untilCharts: Bool?, now: Date = .now) -> String {
        let (s, e) = (notam.starts.flatMap(date), notam.ends.flatMap(date))
        let tfr = notam.kind == "tfr"
        let permanent = !tfr && untilCharts == true
        let unread = !tfr && untilCharts == nil && e != nil
        let firm = permanent || unread ? nil : e
        let year = FieldNotamWords.withYear([s, firm], now: now)
        let starts = s.map { FieldNotamWords.when($0, zone: nil, year: year) }
        let ends = firm.map { FieldNotamWords.when($0, zone: nil, year: year) }
        if notam.inForce == true {
            if permanent { return "In effect now, permanent" }
            return ends.map { "In effect now, until \($0)" } ?? "In effect now"
        }
        if permanent { return starts.map { "From \($0), permanent" } ?? "Permanent" }
        if let starts { return ends.map { "\(starts)–\($0)" } ?? "From \(starts)" }
        return ends.map { "Until \($0)" } ?? (notam.inForce == false ? "Not in effect" : "")
    }

    private static func date(_ text: String) -> Date? {
        (try? Date(text, strategy: .iso8601)) ?? (try? Date(text + "Z", strategy: .iso8601))
    }

    /// The NOTAM's words in sentence case, its codes kept (the engine's
    /// faa_words), without the "!BJC 10/060 BJC" head the row already says.
    static func summary(_ notam: APIRankedNotam) -> String {
        let body = notam.raw.replacing(/^!\S+\s+\S+\s+\S+\s+/, with: "")
        return AirportWords.faaWords(body.isEmpty ? notam.raw : body)
    }

    /// The badge's colour: the token for the kind (color.badge.*), never
    /// a flight category's.
    static func colour(_ notam: APIRankedNotam) -> Color {
        if notam.kind == "tfr" || notam.closed { return Color(uiColor: WingtipColor.Badge.hazard) }
        switch notam.keyword?.uppercased() {
        case "RWY", "TWY", "APRON": return Color(uiColor: WingtipColor.Badge.runway)
        case "NAV", "IAP", "SVC", "COM": return Color(uiColor: WingtipColor.Badge.approach)
        case "OBST": return Color(uiColor: WingtipColor.Badge.lights)
        case "AD": return Color(uiColor: WingtipColor.Badge.chart)
        default: return Color(uiColor: WingtipColor.Badge.other)
        }
    }
}

/// A NOTAM's row: its kind's badge, its words, and when.
struct NotamRow: View {
    let notam: APIRankedNotam
    let untilCharts: Bool?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.md) {
            Text(NotamRows.kind(notam))
                .font(WingtipType.caption)
                .foregroundStyle(.white)
                .padding(.horizontal, WingtipSpace.xs)
                .padding(.vertical, WingtipSpace.xxs)
                .background(NotamRows.colour(notam), in: RoundedRectangle(cornerRadius: WingtipRadius.badge, style: .continuous))
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(NotamRows.summary(notam)).font(.body).lineLimit(4)
                let when = NotamRows.when(notam, untilCharts: untilCharts)
                if !when.isEmpty {
                    Text(when).font(.subheadline.monospacedDigit())
                        .foregroundStyle(notam.inForce == true ? WingtipInk.caution : .secondary)
                }
            }
        }
        .appEntityIdentifier(SiriSaw.notam(notam.id))
        .accessibilityElement(children: .combine)
    }
}

/// One NOTAM in full: its words, why it matters (the engine's reasons),
/// then the NOTAM as sent, monospaced and selectable to copy.
struct NotamDetailView: View {
    let notam: APIRankedNotam
    let untilCharts: Bool?

    var body: some View {
        List {
            Section { Text(NotamRows.summary(notam)).font(.body) }
            if !notam.reasons.isEmpty {
                Section("Why It Matters") {
                    ForEach(notam.reasons, id: \.key) { Text($0.words) }
                }
            }
            Section("As Sent") {
                Text(notam.raw).font(.body.monospaced()).textSelection(.enabled)
                let when = NotamRows.when(notam, untilCharts: untilCharts)
                if !when.isEmpty { LabeledContent("Effective", value: when) }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(notam.kind == "tfr" ? "TFR" : notam.id)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                ShareLink(item: notam.raw) { Label("Share", systemImage: WingtipIcon.share) }
            }
        }
    }
}

/// A TFR's own sections under its lines: its place's name (tfr_read, its
/// dates off, as the time lines say them; the owner, 2026-11-12: "dates
/// are twice"), its instructions as the FAA gives them a line each in
/// sentence case with their codes kept (faa_words), and whom it names to
/// call, each telephone a link that dials.
struct TfrDetailsSections: View {
    let notam: APIRankedNotam
    let read: EngineContract.TfrReadAnswer?

    var body: some View {
        let t = notam.tfr
        if let place = read?.place { Section { Text(place) } }
        if let lines = t?.instructions, !lines.isEmpty {
            Section("Instructions") {
                ForEach(Array(lines.enumerated()), id: \.offset) { _, line in Text(AirportWords.faaWords(line)) }
            }
        }
        if let facility = t?.facility { contact("Coordination Facility", facility) }
        if let contact = t?.contact { self.contact("Point of Contact", contact) }
    }

    private func contact(_ title: String, _ c: APITfrContact) -> some View {
        Section(title) {
            Text(c.name)
            if let phone = c.phone, let dial = URL(string: "tel:+1" + phone.filter(\.isNumber)) {
                Link(destination: dial) { Label(phone, systemImage: WingtipIcon.call).monospacedDigit() }
                    .accessibilityLabel("Call \(phone)")
            }
            if let frequency = c.frequency { LabeledContent("Frequency", value: frequency).monospacedDigit() }
        }
    }
}
