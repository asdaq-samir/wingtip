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
    @State private var problem: String?

    var body: some View {
        List {
            if let ranked {
                let shown = NotamRows.inOrder(ranked.notams)
                if ranked.unchecked?.contains("tfrs") == true {
                    Section { ProblemLine("TFRs couldn't be checked just now.") }
                }
                ForEach(NotamRows.places(shown, source: source), id: \.title) { place in
                    Section {
                        ForEach(place.notams, id: \.id) { notam in
                            NavigationLink { NotamDetailView(notam: notam) } label: { NotamRow(notam: notam) }
                        }
                    } header: {
                        Text("\(place.title) · \(place.notams.count)")
                    }
                }
                if shown.isEmpty {
                    ContentUnavailableView("No NOTAMs", systemImage: "checkmark.bubble", description: Text(source.noneWords))
                }
                if let since = ranked.coverageSince {
                    Section { Text("NOTAMs issued before \(since) and unchanged since aren't held.").font(WingtipType.note).foregroundStyle(.secondary) }
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
                        .loading("Fetching NOTAMs")
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
            ranked = model.notams
            problem = model.notamsProblem ?? (plan.routed ? nil : "Plan a route to see its NOTAMs.")
        case .field(let ident):
            do {
                ranked = try await KeptForAir.answer(.notams, key: "field:\(ident)") { try await Planner.notams(ident) }.value
                problem = nil
            } catch {
                problem = "\(ident)'s NOTAMs couldn't be fetched: \(error.localizedDescription)"
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

    /// "In effect now", "From 1400Z", or the span "1400Z–2200Z", from the
    /// NOTAM's own times; the engine says whether it is in force.
    static func when(_ notam: APIRankedNotam) -> String {
        let starts = notam.starts.flatMap(date).map(Format.zulu)
        let ends = notam.ends.flatMap(date).map(Format.zulu)
        let span = [starts, ends].compactMap { $0 }.joined(separator: "–")
        if notam.inForce == true { return ends.map { "In effect now, until \($0)" } ?? "In effect now" }
        if let starts { return ends == nil ? "From \(starts)" : span }
        return span
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
                let when = NotamRows.when(notam)
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
                let when = NotamRows.when(notam)
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
