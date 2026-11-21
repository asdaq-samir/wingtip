import SwiftUI

/// An approach's own actions under its head row's menu on FPL's line,
/// after the picks of another (the web's procedure menu holds them after
/// its list, docs/navigation.md "An approach"): Approach Brief and Dry Run
/// open ApproachLessonSheet on their page, Plate opens the plate's card
/// (PlateCard: on the map, full screen, its look). An arrival's and a
/// departure's menu has none of them.
struct ApproachMenuItems: View {
    @Environment(Navigator.self) private var nav
    @Environment(FlightUI.self) private var flightUI
    let pick: ProcedurePick

    var body: some View {
        if pick.kind == "approach" {
            Section {
                Button { flightUI.lesson = ApproachLessonAsk(pick: pick, page: .brief) } label: {
                    Label("Approach Brief", systemImage: "text.book.closed")
                }
                Button { flightUI.lesson = ApproachLessonAsk(pick: pick, page: .dryRun) } label: {
                    Label("Dry Run", systemImage: "play")
                }
                Button { nav.open(.plate(PlateKey.of(pick))) } label: {
                    Label("Plate", systemImage: "doc.richtext")
                }
            }
        }
    }
}

/// An approach briefed and flown dry, at the iPhone's width: the system's
/// segmented control at the head picks Brief or Dry Run (the web's
/// ApproachLesson's Brief and Fly). The brief is the engine's items, each
/// its title over its lines; the dry run one step at a time, its fix and
/// altitude, what to do and why, Back and Next under it, at the ground
/// speed picked in a second segmented control. "Training aid, fly the FAA
/// plate" is its subtitle, the one line that says it is not the plate.
struct ApproachLessonSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State var ask: ApproachLessonAsk
    @State private var lesson = ApproachLesson()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Picker("Lesson step", selection: $ask.page) {
                        ForEach(ApproachLessonAsk.Page.allCases) { Text($0.title).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("approach-lesson-steps")
                }
                if let problem = lesson.problem {
                    ProblemLine(problem)
                } else if lesson.loading, lesson.brief.isEmpty {
                    ProgressView("Fetching the approach…")
                } else if ask.page == .brief {
                    briefRows
                } else {
                    dryRunRows
                }
            }
            .navigationTitle(lesson.name.map { AirportWords.faaWords($0) } ?? ask.pick.name)
            .navigationSubtitle("Training aid, fly the FAA plate")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } }
            }
        }
        .task(id: ask.id) { await lesson.load(ask.pick) }
        .accessibilityIdentifier("approach-lesson")
    }

    @ViewBuilder private var briefRows: some View {
        ForEach(lesson.brief, id: \.key) { item in
            Section(item.title) {
                ForEach(Array(item.lines.enumerated()), id: \.offset) { _, line in
                    Text(line).font(WingtipType.detail).fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    @ViewBuilder private var dryRunRows: some View {
        Section {
            Picker("Ground speed", selection: $lesson.gsKt) {
                ForEach(ApproachLesson.speeds, id: \.self) { Text("\(Int($0)) kt").tag($0) }
            }
            .pickerStyle(.segmented)
        } header: {
            Text("Ground speed on the final")
        }
        if lesson.steps.indices.contains(lesson.step) {
            let step = lesson.steps[lesson.step]
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    HStack {
                        Text(step.title).font(WingtipType.row.weight(.semibold))
                        Spacer(minLength: WingtipSpace.sm)
                        if let feet = step.altitudeFt {
                            Text(Format.altitude(feet)).font(WingtipType.detail.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    Text(step.say).font(WingtipType.detail).fixedSize(horizontal: false, vertical: true)
                    if let why = step.why {
                        Text(why).font(WingtipType.note).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("approach-lesson-step")
            } header: {
                Text("Step \(lesson.step + 1) of \(lesson.steps.count)")
            }
            Section {
                HStack {
                    Button("Back") { lesson.step -= 1 }.disabled(lesson.step == 0)
                    Spacer()
                    Button("Next") { lesson.step += 1 }.disabled(lesson.step >= lesson.steps.count - 1)
                }
                .buttonStyle(.bordered)
            }
        }
    }
}
