import ActivityKit
import SwiftUI
import WidgetKit

/// The flight in progress on the Lock Screen and in the Dynamic Island
/// (the app's FlightActivity), in Flighty's phases as Apple describes
/// them ("Spotlight on the Dynamic Island", docs/design/ios.md §15):
/// before departure the route, the departure's category and the planned
/// time en route, like a departure board; in the air a progress bar along
/// the route, the time to the destination, the next fix and the fuel the
/// plan expects left; once down the landing and the block time. The
/// compact island is the route's progress arc and the time en route; the
/// minimal is the arc alone; a narrow island (iOS 27's
/// isDynamicIslandLimitedInWidth) keeps a short figure. The expanded
/// island has no button: one tap opens the app. Every word is
/// FlightActivityLines' (Format), every colour, size and space a token;
/// the Watch's Smart Stack and CarPlay get the small family.
struct FlightActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            FlightLockScreen(attributes: context.attributes, lines: FlightActivityLines(context.state))
                // The cockpit's navy at night, the sheet's grey by day.
                .activityBackgroundTint(WingtipInk.sheet.opacity(0.9))
                .activitySystemActionForegroundColor(WingtipInk.text)
        } dynamicIsland: { context in
            let lines = FlightActivityLines(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeading(lines: lines).padding(.leading, WingtipSpace.xs)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailing(lines: lines).padding(.trailing, WingtipSpace.xs)
                }
                DynamicIslandExpandedRegion(.center) {
                    RouteName(attributes: context.attributes)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottom(lines: lines).padding(.horizontal, WingtipSpace.xs)
                }
            } compactLeading: {
                ProgressArc(lines: lines)
            } compactTrailing: {
                CompactFigure(lines: lines)
            } minimal: {
                ProgressArc(lines: lines)
                    .accessibilityLabel(lines.spoken)
            }
            .keylineTint(Color(WingtipColor.Chart.mapBlue))
        }
        // The Watch's Smart Stack and CarPlay take the small family, which
        // draws the Lock Screen's view in its compact form (WWDC26 223).
        .supplementalActivityFamilies([.small])
    }
}

/// The route's progress as a ring, Flighty's minimal presentation: the
/// airplane inside, the arc in the map's blue, or the copilot's mark in
/// its ink while it has a message. The system's circular capacity gauge,
/// which keeps inside the island's 28-point circle.
struct ProgressArc: View {
    let lines: FlightActivityLines

    var body: some View {
        Gauge(value: lines.progress) {
            Image(systemName: lines.glyph)
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .tint(ink)
        .accessibilityLabel("\(Int((lines.progress * 100).rounded())) percent flown")
    }

    private var ink: Color {
        guard lines.state.copilot != nil else { return Color(WingtipColor.Chart.mapBlue) }
        return lines.state.copilotWarns ? WingtipInk.problem : WingtipInk.caution
    }
}

/// The compact island's figure: its short form when the system draws the
/// island narrow (FlightActivityLines.compactNarrow), the usual one
/// otherwise.
private struct CompactFigure: View {
    let lines: FlightActivityLines

    var body: some View {
        NarrowAwareFigure(lines: lines)
            .font(WingtipType.note.monospacedDigit().weight(.semibold))
            .accessibilityLabel(lines.spoken)
    }
}

private struct NarrowAwareFigure: View {
    let lines: FlightActivityLines
    @Environment(\.isDynamicIslandLimitedInWidth) private var narrow

    var body: some View {
        let words = narrow ? lines.compactNarrow : lines.compact
        if words.isEmpty {
            Image(systemName: "checkmark")
        } else {
            Text(words)
        }
    }
}
