import SwiftUI
import WidgetKit

/// The Live Activity's views by phase (FlightActivityWidget): the Lock
/// Screen's, which the Watch's Smart Stack and CarPlay draw small, and the
/// expanded island's regions. Text is medium weight or heavier and every
/// figure is FlightActivityLines', as Apple's Live Activity guidance asks.

/// The Lock Screen's view, and the notification-style one on a phone with
/// no Dynamic Island, at the system's 14-point margins.
struct FlightLockScreen: View {
    let attributes: FlightActivityAttributes
    let lines: FlightActivityLines
    @Environment(\.activityFamily) private var family

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(alignment: .firstTextBaseline) {
                RouteName(attributes: attributes)
                Spacer(minLength: WingtipSpace.sm)
                ExpandedTrailing(lines: lines)
            }
            switch lines.phase {
            case .ready:
                Text(lines.readyLine).font(WingtipType.detail.weight(.semibold))
            case .airborne:
                ProgressView(value: lines.progress)
                    .tint(Color(WingtipColor.Chart.mapBlue))
                    .accessibilityLabel("\(Int((lines.progress * 100).rounded())) percent flown")
                HStack(alignment: .firstTextBaseline) {
                    Text(lines.nextLine).font(WingtipType.detail.monospacedDigit().weight(.semibold)).lineLimit(1)
                        .accessibilityLabel(lines.nextSentence)
                    Spacer(minLength: WingtipSpace.sm)
                    if let fuel = lines.fuel { Figure(value: fuel, name: "Planned fuel left") }
                }
                // The small family (the Watch, CarPlay) keeps to the route,
                // the bar and the next fix.
                if family != .small { Notes(lines: lines) }
            case .arrived:
                Text(lines.block ?? lines.landed).font(WingtipType.detail.monospacedDigit().weight(.semibold))
            }
        }
        // Apple's Lock Screen margin for a Live Activity, 14 points.
        .padding(WingtipSpace.md + WingtipSpace.xxs)
    }
}

/// "C81 → KDLH", with the airplane symbol in the map's blue.
struct RouteName: View {
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

/// The expanded island's leading side: the next fix in the air, the
/// departure's word before, the landing once down.
struct ExpandedLeading: View {
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch lines.phase {
            case .ready:
                Text("Ready").font(WingtipType.title)
                Text(lines.state.depCategory ?? "No report").font(WingtipType.note).foregroundStyle(.secondary)
            case .airborne:
                Text(lines.next).font(WingtipType.title).lineLimit(1)
                Text("Next · \(lines.nextEte)").font(WingtipType.note.monospacedDigit()).foregroundStyle(.secondary)
            case .arrived:
                Text("Landed").font(WingtipType.title)
                Text(lines.state.landedAt.map(Format.time) ?? Format.none).font(WingtipType.note.monospacedDigit()).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The time side: the planned time en route before departure, the
/// arrival and the time and miles to go in the air, the block time once
/// down.
struct ExpandedTrailing: View {
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .trailing, spacing: 0) {
            switch lines.phase {
            case .ready:
                Text(lines.plannedEte).font(WingtipType.heading.monospacedDigit())
                Text("En route").font(WingtipType.note).foregroundStyle(.secondary)
            case .airborne:
                Text(lines.eta).font(WingtipType.heading.monospacedDigit())
                Text("ETA · \(lines.toGo)").font(WingtipType.note.monospacedDigit()).foregroundStyle(.secondary)
            case .arrived:
                Text(lines.state.blockMin.map(Format.duration) ?? Format.none).font(WingtipType.heading.monospacedDigit())
                Text("Block").font(WingtipType.note).foregroundStyle(.secondary)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// The expanded island's foot: the progress bar in the air, with the
/// fuel, the frequency and the messages under it.
struct ExpandedBottom: View {
    let lines: FlightActivityLines

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            if lines.phase == .airborne {
                ProgressView(value: lines.progress)
                    .tint(Color(WingtipColor.Chart.mapBlue))
                    .accessibilityLabel("\(Int((lines.progress * 100).rounded())) percent flown")
                if let fuel = lines.fuel { Figure(value: fuel, name: "Planned fuel left") }
            }
            Notes(lines: lines)
        }
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

/// What may or may not be there: the frequency, the copilot's line and
/// the route's weather gone worse.
private struct Notes: View {
    let lines: FlightActivityLines

    var body: some View {
        if let frequency = lines.state.frequency {
            Label(frequency, systemImage: "antenna.radiowaves.left.and.right")
                .font(WingtipType.detail.weight(.medium)).lineLimit(1)
        }
        if let copilot = lines.state.copilot {
            Label(copilot, systemImage: lines.glyph)
                .font(WingtipType.detail.weight(.semibold)).lineLimit(2)
                .foregroundStyle(lines.state.copilotWarns ? WingtipInk.problem : WingtipInk.caution)
        }
        if let weather = lines.state.weather {
            Label(weather, systemImage: "cloud.bolt")
                .font(WingtipType.detail.weight(.semibold)).lineLimit(2)
                .foregroundStyle(WingtipInk.caution)
        }
    }
}
