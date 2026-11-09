import ActivityKit
import SwiftUI
import WidgetKit

/// The flight in progress on the Lock Screen and in the Dynamic Island
/// (the app's FlightActivity), drawn as Apple's Live Activity guidance
/// has it: the Lock Screen's banner with the whole picture; the island's
/// compact sides with one glyph and one figure (the minutes to the next
/// fix); the minimal with the glyph alone; and the expanded island with
/// the next fix, the arrival and, under them, the fuel, the frequency and
/// the copilot's message. Every word is FlightActivityLines' (Format),
/// every colour, size and space a token.
struct FlightActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FlightActivityAttributes.self) { context in
            FlightBanner(attributes: context.attributes, lines: FlightActivityLines(context.state))
                .activityBackgroundTint(Color(.systemBackground).opacity(0.85))
                .activitySystemActionForegroundColor(.primary)
        } dynamicIsland: { context in
            let lines = FlightActivityLines(context.state)
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    NextFix(lines: lines).padding(.leading, WingtipSpace.xs)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Arrival(lines: lines).padding(.trailing, WingtipSpace.xs)
                }
                DynamicIslandExpandedRegion(.center) {
                    RouteName(attributes: context.attributes)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Extras(lines: lines).padding(.horizontal, WingtipSpace.xs)
                }
            } compactLeading: {
                Glyph(lines: lines)
            } compactTrailing: {
                Text(lines.compact)
                    .font(WingtipType.note.monospacedDigit().weight(.semibold))
                    .accessibilityLabel(lines.nextSentence)
            } minimal: {
                Glyph(lines: lines)
                    .accessibilityLabel(lines.spoken)
            }
        }
    }
}

/// The Lock Screen's banner, and the notification-style view on a phone
/// with no Dynamic Island: the route and arrival, the next fix and the
/// fuel, then the frequency and the copilot's message where there are.
private struct FlightBanner: View {
    let attributes: FlightActivityAttributes
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(alignment: .firstTextBaseline) {
                RouteName(attributes: attributes)
                Spacer(minLength: WingtipSpace.sm)
                Arrival(lines: lines)
            }
            HStack(alignment: .firstTextBaseline) {
                NextFix(lines: lines)
                Spacer(minLength: WingtipSpace.sm)
                if let fuel = lines.fuel { Figure(value: fuel, name: "Planned fuel left") }
            }
            Extras(lines: lines, fuel: false)
        }
        .padding(WingtipSpace.md)
    }
}

/// "C81 → KDLH", with the airplane symbol in the map's blue.
private struct RouteName: View {
    let attributes: FlightActivityAttributes

    var body: some View {
        HStack(spacing: WingtipSpace.xs) {
            Image(systemName: "airplane").foregroundStyle(Color(WingtipColor.Chart.mapBlue))
            Text("\(attributes.dep) → \(attributes.dest)").font(WingtipType.title).lineLimit(1)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Flight from \(attributes.dep) to \(attributes.dest)")
    }
}

/// The next fix by name, and the minutes to it under.
private struct NextFix: View {
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(lines.next).font(WingtipType.title).lineLimit(1).minimumScaleFactor(0.8)
            Text("Next · \(lines.nextEte)").font(WingtipType.note.monospacedDigit()).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(lines.nextSentence)
    }
}

/// The arrival as a clock time, and the time and miles to go under.
private struct Arrival: View {
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(lines.eta).font(WingtipType.heading.monospacedDigit())
            Text("ETA · \(lines.toGo)").font(WingtipType.note.monospacedDigit()).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Arriving \(lines.eta), \(lines.toGo) to go")
    }
}

/// A figure with its name under, right-aligned.
private struct Figure: View {
    let value: String
    let name: String

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            Text(value).font(WingtipType.detail.monospacedDigit().weight(.semibold))
            Text(name).font(WingtipType.note).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// What may or may not be there: the fuel (the expanded island; the
/// banner has it by the next fix), the frequency and the copilot's line.
private struct Extras: View {
    let lines: FlightActivityLines
    var fuel = true

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            if (fuel && lines.fuel != nil) || lines.state.frequency != nil {
                HStack(alignment: .firstTextBaseline) {
                    if let frequency = lines.state.frequency {
                        Label(frequency, systemImage: "antenna.radiowaves.left.and.right")
                            .font(WingtipType.detail).lineLimit(1)
                    }
                    Spacer(minLength: WingtipSpace.sm)
                    if fuel, let gal = lines.fuel { Figure(value: gal, name: "Planned fuel left") }
                }
            }
            if let copilot = lines.state.copilot {
                Label(copilot, systemImage: lines.glyph)
                    .font(WingtipType.detail.weight(.semibold)).lineLimit(2)
                    .foregroundStyle(lines.state.copilotWarns ? WingtipInk.problem : WingtipInk.caution)
            }
        }
    }
}

/// The island's glyph: the airplane in the map's blue, or the copilot's
/// mark in its ink while it has a message.
private struct Glyph: View {
    let lines: FlightActivityLines

    var body: some View {
        Image(systemName: lines.glyph)
            .foregroundStyle(lines.state.copilot == nil ? Color(WingtipColor.Chart.mapBlue)
                : lines.state.copilotWarns ? WingtipInk.problem : WingtipInk.caution)
    }
}
