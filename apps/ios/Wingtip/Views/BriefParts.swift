import SwiftUI

/// The Brief's head and foot, laid out as Apple's Weather puts the
/// takeaway first and a task's primary action at the foot
/// (docs/design/ios.md §5): the engine's verdict as a title with its mark
/// and colour (never colour alone, HIG Accessibility), and Start Flight
/// in the system's bottom bar, which starts the flight's Live Activity.
/// The verdict and every word in it are the planner's and the engine's;
/// the pilot may always start (warn, never limit).

/// The verdict as Weather's title and subtitle: the planner's line in a
/// card's size, coloured and marked by its finding, over Ready to Fly's.
struct BriefVerdictHead: View {
    @Environment(Verdict.self) private var verdict
    @Environment(ReadyToFly.self) private var ready

    var body: some View {
        if let answer = verdict.answer {
            Section {
                VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                    Label {
                        Text(answer.line.words).font(WingtipType.card)
                            .contentTransition(.opacity)
                    } icon: {
                        Image(systemName: FindingStyle.symbol(answer.line.finding))
                            .accessibilityLabel(FindingStyle.word(answer.line.finding))
                    }
                    .foregroundStyle(FindingStyle.colour(answer.line.finding))
                    if let line = ready.answer?.line {
                        Text(line).font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                .animation(.default, value: answer.line.words)
                .accessibilityElement(children: .combine)
                .accessibilityAddTraits(.isHeader)
                .listRowBackground(Color.clear)
                .listRowInsets(EdgeInsets(top: WingtipSpace.sm, leading: WingtipSpace.lg, bottom: WingtipSpace.sm, trailing: WingtipSpace.lg))
            }
            // A new caution felt once, not on every refresh (HIG Haptics).
            .sensoryFeedback(.warning, trigger: answer.line.finding) { old, new in old != new && new != "ok" }
        }
    }
}

/// Start Flight at the Brief's foot, full width in the tint's glass, as
/// a task's one primary action sits in the bottom bar (HIG: "in the
/// middle or bottom area of the display"); End Flight once one is going.
/// Starting runs FlightSwitch, as the Control Center control does.
struct StartFlightBar: View {
    @State private var started = false
    @State private var problem: String?

    var body: some View {
        #if canImport(ActivityKit)
        VStack(spacing: WingtipSpace.xs) {
            if started {
                Button { Task { _ = await FlightSwitch.set(false); started = false } } label: {
                    Label("End Flight", systemImage: "stop.fill").frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
                }
                .glassButton()
            } else {
                Button {
                    Task {
                        problem = await FlightSwitch.set(true)
                        started = problem == nil
                    }
                } label: {
                    Label("Start Flight", systemImage: "airplane.departure").frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget)
                }
                .glassProminentButton()
                .accessibilityHint("Starts the flight's Live Activity")
            }
            ProblemLine(problem)
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.sm)
        .onAppear { started = FlightActivity.shared.running }
        #endif
    }
}
