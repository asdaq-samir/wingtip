import SwiftUI

/// The strip's head: the verdict -- go, caution or no-go, in the planner's
/// words (Verdict, POST /api/go-no-go) -- on a paper card, the route's
/// line under it in condensed capitals ("C81 → KJVL → KDLH · C172 ·
/// FL-045 · leaving now"), the route's other ways in a menu, and at most
/// three one-line findings from the glance (Glance.lines), each a row
/// into the Brief. The route's menu (Share, File, Clear) at the head's
/// corner, where the tabs' route box had it. No photo behind the
/// verdict: of the canvas's looks the owner kept the chart's ink and the
/// glass cockpit alone (2026-11-04).
struct StripHead: View {
    @Environment(Navigator.self) private var nav
    @Environment(Plan.self) private var plan
    @Environment(Verdict.self) private var verdict
    @Environment(\.chartInk) private var ink
    /// At the accessibility sizes the route's line wraps rather than is cut.
    @Environment(\.dynamicTypeSize) private var size
    /// A finding's row, or the verdict, tapped: the Brief.
    let onBrief: () -> Void
    let onFile: () -> Void

    private var line: String {
        StripData.headLine(dep: plan.dep, dest: plan.dest, stops: plan.stops, airplane: plan.airplaneName ?? "",
                           cruiseFt: plan.ownAltitudeFt ?? plan.altitudeFt, departAt: nil)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            card
            ways
            if let answer = verdict.answer {
                ForEach(Glance.lines(answer)) { glanceLine in
                    Button(action: onBrief) {
                        HStack(spacing: WingtipSpace.md) {
                            Image(systemName: FindingStyle.symbol(glanceLine.finding))
                                .foregroundStyle(ink.finding(glanceLine.finding))
                                .accessibilityHidden(true)
                            Text(glanceLine.words)
                                .font(ChartInk.text.weight(.medium))
                                .multilineTextAlignment(.leading)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            Image(systemName: "chevron.right").foregroundStyle(ink.tint).accessibilityHidden(true)
                        }
                        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.md)
                        .frame(minHeight: 44)
                    }
                    .buttonStyle(.plain)
                    .inkCard()
                    .accessibilityLabel("\(FindingStyle.word(glanceLine.finding)): \(glanceLine.words)")
                    .accessibilityHint("Opens the Brief")
                }
            }
        }
        .accessibilityIdentifier("strip-head")
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(alignment: .top) {
                Spacer(minLength: 0)
                menu
            }
            if let answer = verdict.answer {
                Button(action: onBrief) {
                    HStack(spacing: WingtipSpace.md) {
                        Image(systemName: FindingStyle.symbol(answer.line.finding))
                            .font(.title2)
                            .foregroundStyle(ink.finding(answer.line.finding))
                            .accessibilityHidden(true)
                        Text(answer.line.words)
                            .font(ChartInk.heading)
                            .foregroundStyle(ink.finding(answer.line.finding))
                            .multilineTextAlignment(.leading)
                    }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("\(FindingStyle.word(answer.line.finding)): \(answer.line.words)")
                .accessibilityHint("Opens the Brief")
            } else if let problem = verdict.problem {
                ProblemLine(problem)
            } else {
                Text("Reading the brief…").font(ChartInk.heading).foregroundStyle(ink.muted)
            }
            // The line names the N-number, which opens its profile (the
            // owner, 2026-11-09); in the chart's magenta, as the route is.
            Group {
                if let tail = plan.tail {
                    Button { nav.push(.tail(ProfileAsk(tail: tail))) } label: { lineText }
                        .buttonStyle(.plain)
                        .accessibilityHint("Opens \(tail)'s profile")
                } else {
                    lineText
                }
            }
            .accessibilityLabel(StripData.spokenHeadLine(dep: plan.dep, dest: plan.dest, stops: plan.stops, airplane: plan.airplaneName ?? "",
                                                         cruiseFt: plan.ownAltitudeFt ?? plan.altitudeFt, departAt: nil))
        }
        .padding(WingtipSpace.lg)
        .frame(maxWidth: .infinity, minHeight: 112, alignment: .bottomLeading)
        .inkCard()
    }

    private var lineText: some View {
        Text(line)
            .condensedCaps()
            .foregroundStyle(ink.magenta)
            .lineLimit(size.isAccessibilitySize ? nil : 1)
    }

    /// The route's menu: Share (its own menu, the web's ShareMenu), File,
    /// Clear.
    private var menu: some View {
        Menu {
            ShareMenu()
            Button { onFile() } label: { Label("File Flight Plan", systemImage: WingtipIcon.send) }
            Divider()
            Button(role: .destructive) { plan.clear() } label: { Label("Clear Route", systemImage: WingtipIcon.close) }
        } label: {
            Image(systemName: WingtipIcon.more)
                .font(.body.weight(.medium))
                .foregroundStyle(ink.tint)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle().inset(by: -6))
        }
        .accessibilityLabel("The route's menu")
    }

    /// The route's other ways (the planner's chips), in the system's
    /// menu picker as the plan's sheet has them (RouteWayPicker).
    @ViewBuilder
    private var ways: some View {
        if let chips = plan.routes?.chips, chips.count > 1 {
            RouteWayPicker()
        }
    }
}
