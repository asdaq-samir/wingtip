import SwiftUI

/// A finding's mark and colour, the one scale the Brief says every check
/// on (the web's lib/findings): nothing against it, something to look at,
/// something to fix before the flight goes as planned, not worked out,
/// or still being worked out.
enum FindingStyle {
    static func symbol(_ finding: String) -> String {
        switch finding {
        case "ok": "checkmark.circle.fill"
        case "caution": "exclamationmark.triangle.fill"
        case "stop": "xmark.octagon.fill"
        case "pending": "clock"
        default: "questionmark.circle"
        }
    }

    static func colour(_ finding: String) -> Color {
        switch finding {
        // The tokens' inks (go, caution, destructive), as the web says them.
        case "ok": WingtipInk.go
        case "caution": WingtipInk.caution
        case "stop": WingtipInk.problem
        default: .secondary
        }
    }

    /// The finding in a word, for VoiceOver, where the mark's shape and
    /// colour say it to the eye.
    static func word(_ finding: String) -> String {
        switch finding {
        case "ok": "Clear"
        case "caution": "Caution"
        case "stop": "Stop"
        case "pending": "Still being checked"
        default: "Not worked out"
        }
    }
}

/// Where a finding opens: a section of the Brief by its anchor, or a page
/// of its own (the loading, the risk); nil where the Brief has no part of
/// its own for it yet.
enum VerdictTarget: Equatable {
    case section(String)
    case loading
    case risk
    /// The airplane's figures the finding is worked from (its fuel, its
    /// runway distances): its profile (AirplaneProfileView).
    case airplane

    /// The Brief's anchors the weather's and the airspace's findings open.
    static let weatherAnchor = "brief-weather"
    static let airspaceAnchor = "brief-tfrs"

    static func of(_ item: VerdictItem) -> VerdictTarget? {
        switch item.key {
        case "weather": return .section(weatherAnchor)
        case "airspace": return .section(airspaceAnchor)
        case "balance": return .loading
        case "risk": return .risk
        case "fuel", "runways": return .airplane
        default: return nil
        }
    }
}

/// The Go / No-Go at the top of the Brief: the planner's line over its
/// findings, then each finding in its colour with what was found, each
/// opening where the Brief says it in full; the pilot's minimums under
/// them, which the weather is held to.
struct GoNoGoSection: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Verdict.self) private var verdict
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    /// Scrolls the Brief to one of its sections.
    var open: (String) -> Void
    /// The Go / No-Go in words (Words.swift), over its findings: the
    /// planner's, else this iPhone's; written again as the answer changes.
    @State private var riskWords: SaidWords?
    @State private var writingWords = false
    /// The instructor the pilot asked in, once they accepted, for the
    /// note at the foot.
    @State private var instructor: InstructorLink?
    /// Said where the instructor's line goes, rather than read as none.
    @State private var instructorProblem: String?
    @State private var restOpen = false

    var body: some View {
        // The glance on this iPhone first (OnDevice/BriefSummary), once
        // the words have been asked for.
        if let answer = verdict.answer, riskWords != nil {
            BriefSummarySection(answer: answer)
        }
        if verdict.answer != nil {
            WordsSection(title: "The flight in words", said: riskWords, writing: writingWords)
        }
        Section {
            if let answer = verdict.answer {
                Label {
                    Text(answer.line.words).font(.headline)
                } icon: {
                    Image(systemName: FindingStyle.symbol(answer.line.finding))
                        .accessibilityLabel(FindingStyle.word(answer.line.finding))
                }
                .foregroundStyle(FindingStyle.colour(answer.line.finding))
                .accessibilityElement(children: .combine)
                KeptAgeLine(kind: .goNoGo, key: ReadyToFly.flightKey(plan))
                // At a glance (the owner's rule, 2026-11-03): at most three
                // lines a pilot acts on, each opening to its why, and the
                // rest in one row.
                ForEach(Glance.lines(answer)) { line in
                    if let item = answer.items.first(where: { $0.key == line.key }) {
                        FindingFold(item: item, words: line.words, open: open)
                    }
                }
                if let rest = Glance.restWords(answer) {
                    DisclosureGroup(isExpanded: $restOpen) {
                        ForEach(Glance.rest(answer)) { item in row(item) }
                    } label: {
                        Label {
                            Text(rest)
                        } icon: {
                            let finding = Glance.rest(answer).contains { $0.finding != "ok" } ? "caution" : "ok"
                            Image(systemName: FindingStyle.symbol(finding)).foregroundStyle(FindingStyle.colour(finding))
                                .accessibilityLabel(FindingStyle.word(finding))
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
                // What the airplane's findings lack, asked in place (the
                // owner, 2026-11-09); its charts a link to its profile.
                AskFigureRow(needs: [.fuelTotals, .takeoffLanding], pickDetail: "Its fuel and runway findings are worked from its figures")
            } else if let problem = verdict.problem {
                Label(problem, systemImage: "exclamationmark.triangle").foregroundStyle(.secondary)
            } else {
                ProgressView("Checking the flight…")
            }
            if let instructor {
                Label {
                    Text("Your instructor, \(instructor.name ?? instructor.email), reviews the flights you put to them from their phone.")
                        .font(.subheadline)
                } icon: {
                    Image(systemName: "person.crop.circle").foregroundStyle(accent)
                }
                .accessibilityElement(children: .combine)
            }
            ProblemLine(verdict.pilotProblem)
            ProblemLine(instructorProblem)
        } header: {
            HStack {
                Text("Go / No-Go")
                if verdict.asking, verdict.answer != nil { ProgressView().controlSize(.mini) }
            }
        }
        .task(id: session.signedIn) {
            // The instructor's name comes with the training (Gateway);
            // none for a pilot with no instructor, or signed out.
            guard session.signedIn else { instructor = nil; instructorProblem = nil; return }
            do {
                instructor = (try await Gateway.training())?.instructors.first { $0.accepted }
                instructorProblem = nil
            } catch {
                instructorProblem = "Whether an instructor reviews your flights couldn't be fetched."
            }
        }
        // The words for the answer on the page; the findings stay as they
        // are while they are written.
        .task(id: verdict.answer) {
            guard let answer = verdict.answer else { riskWords = nil; return }
            writingWords = true
            defer { writingWords = false }
            let said = await WordsFor().said(WordsAsk(kind: .risk, figures: WordsFigures.risk(answer)))
            guard !Task.isCancelled else { return }
            riskWords = said
        }
    }

    @ViewBuilder private func row(_ item: VerdictItem) -> some View {
        let content = VerdictRow(item: item)
        switch VerdictTarget.of(item) {
        case .section(let anchor)?:
            Button { open(anchor) } label: { content }.buttonStyle(.plain)
        case .loading?:
            NavigationLink { LoadingView() } label: { content }
        case .risk?:
            NavigationLink { RiskView() } label: { content }
        case .airplane?:
            AirplaneFiguresLink { content }
        case nil:
            content
        }
    }
}

/// One finding: its mark, its name and what was found.
struct VerdictRow: View {
    let item: VerdictItem

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: WingtipSpace.md) {
            Image(systemName: FindingStyle.symbol(item.finding)).foregroundStyle(FindingStyle.colour(item.finding))
                .accessibilityLabel(FindingStyle.word(item.finding))
            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                Text(item.label).font(.body.weight(.semibold))
                Text(item.detail).font(.subheadline)
                    .foregroundStyle(item.finding == "stop" ? WingtipInk.problem : Color.secondary)
            }
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One of the glance's lines: the finding's sentence, opening to its why
/// (what the planner found, and where the Brief says it in full) and a
/// way to the reports themselves: the Brief's section for the weather
/// and the airspace, the loading's and the risk's own pages.
struct FindingFold: View {
    let item: VerdictItem
    let words: String
    var open: (String) -> Void
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                Text(item.detail).font(.subheadline)
                Text("In the Brief: \([item.tab.capitalized, item.section].compactMap { $0 }.joined(separator: " · "))")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            switch VerdictTarget.of(item) {
            case .section(let anchor)?:
                Button("See the reports") { open(anchor) }
            case .loading?:
                NavigationLink("See the loading") { LoadingView() }
            case .risk?:
                NavigationLink("See the risk assessment") { RiskView() }
            case .airplane?:
                AirplaneFiguresLink { Text("See the Airplane's Figures") }
            case nil:
                EmptyView()
            }
        } label: {
            Label {
                Text(words).font(.body.weight(item.finding == "stop" ? .semibold : .regular))
            } icon: {
                Image(systemName: FindingStyle.symbol(item.finding)).foregroundStyle(FindingStyle.colour(item.finding))
                    .accessibilityLabel(FindingStyle.word(item.finding))
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// The risk assessment (the web's RiskAssessment): the planner's level and
/// points, what the briefing, the nav log and the logbook raised, then
/// what only the pilot can say, ticked where it is so.
struct RiskView: View {
    @Environment(Verdict.self) private var verdict
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session

    var body: some View {
        List {
            if let risk = verdict.answer?.risk {
                Section {
                    VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                        // The level's mark with its colour, so the line reads
                        // the same to a pilot who does not see the colour.
                        Label(risk.line, systemImage: FindingStyle.symbol(finding(risk.level)))
                            .font(.headline).foregroundStyle(colour(risk.level))
                        Text(risk.words)
                    }
                    .accessibilityElement(children: .combine)
                }
                let own = Set((verdict.answer?.selfChecks ?? []).map(\.key))
                let raised = risk.factors.filter { !own.contains($0.key) }
                Section("From the Briefing and Your Logbook") {
                    if raised.isEmpty {
                        Text("Nothing raised").foregroundStyle(.secondary)
                    } else {
                        ForEach(raised) { factor in
                            LabeledContent {
                                Text(factor.value)
                            } label: {
                                Label {
                                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                        Text(factor.label)
                                        if let why = factor.why { Text(why).font(.footnote).foregroundStyle(.secondary) }
                                    }
                                } icon: {
                                    Image(systemName: FindingStyle.symbol(factor.finding ?? "caution"))
                                        .foregroundStyle(FindingStyle.colour(factor.finding ?? "caution"))
                                        .accessibilityLabel(FindingStyle.word(factor.finding ?? "caution"))
                                }
                            }
                            .accessibilityElement(children: .combine)
                        }
                    }
                }
            } else if let problem = verdict.problem {
                Text(problem).foregroundStyle(.secondary)
            } else {
                ProgressView("Waiting on the briefing…")
            }
            let checks = verdict.answer?.selfChecks ?? []
            ForEach(groups(checks), id: \.self) { group in
                Section(group) {
                    ForEach(checks.filter { $0.group == group }) { check in
                        Toggle(isOn: Binding(get: { verdict.ticked.contains(check.key) }, set: { verdict.tick(check.key, $0) })) {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(check.label)
                                Text([check.why, check.value].compactMap { $0 }.joined(separator: " · "))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Risk Assessment")
        .task(id: verdict.key(for: plan)) { await verdict.refresh(plan: plan, signedIn: session.signedIn) }
    }

    /// The groups in the order the checks come.
    private func groups(_ checks: [RiskCheck]) -> [String] {
        var seen: [String] = []
        for check in checks where !seen.contains(check.group) { seen.append(check.group) }
        return seen
    }

    /// The risk's level as a finding: low is clear, caution is caution,
    /// anything higher a stop.
    private func finding(_ level: String) -> String {
        switch level {
        case "low": "ok"
        case "caution": "caution"
        default: "stop"
        }
    }

    private func colour(_ level: String) -> Color { FindingStyle.colour(finding(level)) }
}

#Preview("GoNoGoSection") {
    // The planner's answer comes with a route, so the section is at its
    // "Checking the flight…" state here, with the minimums under it.
    NavigationStack {
        List { GoNoGoSection { _ in } }
    }
    .environment(Verdict())
    .environment(Session())
    .environment(Plan())
}

#Preview("FindingFold") {
    List {
        FindingFold(item: VerdictItem(detail: "The baggage, 170 lb in all, is over its 120 lb", finding: "stop", key: "balance", label: "Weight & balance", section: "Weight & Balance", tab: "preflight"),
                    words: "Weight & balance: The baggage, 170 lb in all, is over its 120 lb.") { _ in }
    }
}

#Preview("VerdictRow") {
    List {
        VerdictRow(item: VerdictItem(detail: "VFR along the route, KDLH 10 sm, few at 4,500 ft", finding: "ok", key: "weather", label: "Weather", tab: "brief"))
        VerdictRow(item: VerdictItem(detail: "8.4 gal at landing, 1.9 gal over the reserve", finding: "caution", key: "fuel", label: "Fuel", tab: "navlog"))
        VerdictRow(item: VerdictItem(detail: "TFR over KHIB until 15:00", finding: "stop", key: "airspace", label: "Airspace", tab: "brief"))
    }
}

#Preview("MinimumsView") {
    NavigationStack { MinimumsView() }
        .environment(Verdict())
}
