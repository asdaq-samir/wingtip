import SwiftUI

/// The pilot's own proficiency plan (the web app's Logbook Coach). On the
/// pilot's ask: what is due and when (14 CFR 61.56, 61.57), what their
/// debriefed flights show, and up to four sessions -- what, where, how
/// long, and where it may count toward WINGS -- all the engine's
/// (proficiency_plan), with a short paragraph and a line a session from
/// the assistant. It opens on what to do; the currencies and the evidence
/// come under it. Every figure is shown as the engine gave it.
struct CoachView: View {
    @Environment(Session.self) private var session
    @State private var model = CoachModel()

    var body: some View {
        List {
            if !session.signedIn {
                ContentUnavailableView("Sign in for your plan", systemImage: "figure.walk.motion", description: Text("Your plan is made from the logbook kept with your account."))
            } else {
                Section(title: "Your Certificate") {
                    Picker("Certificate", selection: Binding(get: { model.certificate }, set: { model.certificate = $0 })) {
                        ForEach(CoachCertificate.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.menu)
                }
                Section {
                    Button { Task { await model.make(home: session.pilot?.homeBase) } } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(model.plan == nil ? "Make My Plan" : "Make It Again")
                            Text(model.making ? "Reading your logbook…" : "From your logbook and the fields near \(home)")
                                .font(WingtipType.note).foregroundStyle(.secondary)
                        }
                    }
                    .disabled(!model.ready || model.making)
                    ProblemLine(model.problem)
                }
                if let plan = model.plan { planSections(plan) }
            }
        }
        .navigationTitle("Coach")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: session.signedIn) { if session.signedIn { await model.load() } }
    }

    private var home: String {
        session.pilot?.homeBase.flatMap { $0.isEmpty ? nil : $0.uppercased() } ?? "your home base"
    }

    @ViewBuilder private func planSections(_ plan: ProficiencyPlan) -> some View {
        if !plan.reminders.isEmpty {
            Section(title: "Reminders") {
                ForEach(plan.reminders, id: \.key) { r in
                    Text(r.text).foregroundStyle(WingtipInk.caution)
                }
            }
        }
        wordsSection
        Section(title: "Sessions") {
            if plan.sessions.isEmpty {
                Text("Nothing to practise for now: every currency is good past the reminders, and no debrief shows a weak area.")
                    .foregroundStyle(.secondary)
            }
            let lines = model.sessionLines
            ForEach(plan.sessions, id: \.id) { s in sessionRow(s, line: lines[s.id]) }
        }
        Section(title: "What Is Due") {
            ForEach(plan.due, id: \.key) { d in
                LabeledContent {
                    Text(CoachModel.statusWords(d)).monospacedDigit().foregroundStyle(tone(d.status))
                } label: {
                    Text(d.label)
                    Text("\(d.rule) · \(d.detail)")
                }
            }
        }
        if !plan.weakAreas.isEmpty {
            Section(title: "From Your Debriefs") {
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

    // The words come after the plan; with none, the plan stands as it is.
    @ViewBuilder private var wordsSection: some View {
        if model.wording {
            Section { Text("Putting your plan into words…").font(WingtipType.prose).foregroundStyle(.secondary) }
        } else if let words = model.words, !words.sentences.isEmpty {
            Section { Text(words.sentences.map(\.text).joined(separator: " ")).font(WingtipType.prose) }
        } else if let why = model.wordsProblem {
            Section { Text(why).font(WingtipType.prose).foregroundStyle(.secondary) }
        }
    }

    private func sessionRow(_ s: CoachSession, line: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s.practise).font(WingtipType.row)
            Text(CoachModel.sessionDetail(s)).font(WingtipType.note).foregroundStyle(.secondary)
            if let wings = s.wings {
                Text("May count toward WINGS: \(wings.area), ACS \(wings.acs)").font(WingtipType.note).foregroundStyle(.secondary)
            }
            if let line { Text(line).font(WingtipType.detail) }
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
