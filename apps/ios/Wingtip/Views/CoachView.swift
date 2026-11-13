import SwiftUI

/// The pilot's own proficiency plan (the web app's Logbook Coach). On the
/// pilot's ask: what is due and when (14 CFR 61.56, 61.57), what their
/// debriefed flights show, and up to four sessions -- what, where, how
/// long, and where it may count toward WINGS -- all the engine's
/// (proficiency_plan). It opens on what to do; the currencies and the evidence
/// come under it. Every figure is shown as the engine gave it. Laid out
/// as Apple's Fitness Summary (docs/design/ios.md §10): a large title,
/// the next lesson first with its one filled button, the trends of the
/// last 90 days against the year's pace with their arrows and words, then
/// practice, the sessions, what is due, the debriefs and the instructor.
struct CoachView: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Session.self) private var session
    @State private var model = CoachModel()

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in for your plan", systemImage: "figure.walk.motion", description: Text("Your plan is made from the logbook kept with your account."))
            } else {
                Section("Your Certificate") {
                    Picker("Certificate", selection: Binding(get: { model.certificate }, set: { model.certificate = $0 })) {
                        ForEach(CoachCertificate.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                nextLesson
                trendsSection
                if let plan = model.plan { planSections(plan) }
                Section("Practice") { PracticeRows() }
                Section("Instructor") {
                    NavigationLink(value: SheetPage.training) { Label("Training and Endorsements", systemImage: "graduationcap") }
                    NavigationLink(value: SheetPage.instructing) { Label("Instructing", systemImage: "person.2") }
                }
            }
        }
        .navigationTitle("Coach")
        .navigationBarTitleDisplayMode(.large)
        .task(id: session.signedIn) { if session.signedIn { await model.load() } }
    }

    /// The next lesson as Fitness puts its one card first: the plan's
    /// first session, why it is suggested, and the one filled button that
    /// makes the plan (again) from the logbook.
    private var nextLesson: some View {
        Section {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                if let first = model.plan?.sessions.first {
                    Text(first.practise).font(WingtipType.card)
                    Text(CoachModel.sessionDetail(first)).font(WingtipType.detail).foregroundStyle(.secondary)
                } else {
                    Text("Your Next Lesson").font(WingtipType.card)
                    Text(model.making ? "Reading your logbook…" : "From your logbook and the fields near \(home)")
                        .font(WingtipType.detail).foregroundStyle(.secondary)
                }
                Button { Task { await model.make(home: session.pilot?.homeBase) } } label: {
                    Text(model.plan == nil ? "Make My Plan" : "Make It Again").frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
                }
                .glassProminentButton()
                .disabled(!model.ready || model.making)
                ProblemLine(model.problem)
            }
            .padding(.vertical, WingtipSpace.xs)
        } header: {
            Text("Next Lesson")
        }
    }

    /// The last 90 days against the year's pace, each with its arrow and
    /// words; with too few flights, how many more it takes.
    @ViewBuilder private var trendsSection: some View {
        if let entries = model.pilot?.entries {
            Section("Trends") {
                if let trends = CoachTrends.trends(entries) {
                    ForEach(trends) { t in
                        Label {
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(t.title).font(WingtipType.row)
                                Text(t.words).font(WingtipType.detail).foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: Self.symbol(t.way)).foregroundStyle(t.way == .down ? WingtipInk.caution : accent)
                        }
                        .accessibilityElement(children: .combine)
                    }
                } else {
                    let more = CoachTrends.flightsToGo(entries)
                    Text("Log \(more) more flight\(more == 1 ? "" : "s") this year to see your trends.").foregroundStyle(.secondary)
                }
            }
        }
    }

    private static func symbol(_ way: CoachTrends.Way) -> String {
        switch way {
        case .up: "arrow.up.circle.fill"
        case .down: "arrow.down.circle.fill"
        case .steady: "equal.circle.fill"
        }
    }

    private var home: String {
        session.pilot?.homeBase.flatMap { $0.isEmpty ? nil : $0.uppercased() } ?? "your home base"
    }

    @ViewBuilder private func planSections(_ plan: ProficiencyPlan) -> some View {
        if !plan.reminders.isEmpty {
            Section("Reminders") {
                ForEach(plan.reminders, id: \.key) { r in
                    Text(r.text).foregroundStyle(WingtipInk.caution)
                }
            }
        }
        Section("Sessions") {
            if plan.sessions.isEmpty {
                Text("Nothing to practise for now: every currency is good past the reminders, and no debrief shows a weak area.")
                    .foregroundStyle(.secondary)
            }
            ForEach(plan.sessions, id: \.id) { s in sessionRow(s) }
        }
        Section("What Is Due") {
            ForEach(plan.due, id: \.key) { d in
                LabeledContent {
                    Label(CoachModel.statusWords(d), systemImage: symbol(d.status)).monospacedDigit().foregroundStyle(tone(d.status))
                } label: {
                    Text(d.label)
                    Text("\(d.rule) · \(d.detail)")
                }
            }
        }
        if !plan.weakAreas.isEmpty {
            Section("From Your Debriefs") {
                ForEach(plan.weakAreas, id: \.key) { w in
                    DisclosureGroup {
                        ForEach(plan.evidence.filter { w.evidence.contains($0.id) }, id: \.id) { e in
                            Text(CoachModel.evidenceLine(e)).font(WingtipType.detail).foregroundStyle(.secondary)
                        }
                    } label: {
                        Text("\(w.label) · \(w.evidence.count) · ACS \(w.acs.joined(separator: ", "))")
                    }
                }
            }
        }
    }

    private func sessionRow(_ s: CoachSession) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
            Text(s.practise).font(WingtipType.row)
            Text(CoachModel.sessionDetail(s)).font(WingtipType.note).foregroundStyle(.secondary)
            if let wings = s.wings {
                Text("May count toward WINGS: \(wings.area), ACS \(wings.acs)").font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
    }

    /// A symbol beside the colour, never colour alone (HIG Accessibility).
    private func symbol(_ status: String) -> String {
        switch status {
        case "current": "checkmark.circle.fill"
        case "due_soon", "pending": "exclamationmark.triangle.fill"
        case "lapsed": "xmark.octagon.fill"
        default: "questionmark.circle"
        }
    }

    private func tone(_ status: String) -> Color {
        switch status {
        case "current": WingtipInk.go
        case "due_soon", "pending": WingtipInk.caution
        case "lapsed": WingtipInk.problem
        default: .secondary
        }
    }
}

#Preview("CoachView") {
    // Signed out, the coach asks for the account; its plan comes from the
    // planner once signed in.
    NavigationStack { CoachView() }
        .environment(Session())
}
