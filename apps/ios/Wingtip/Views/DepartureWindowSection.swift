import SwiftUI

/// "When should I go?" in the Brief, under the Go / No-Go: an hour-by-hour
/// strip across as far as the forecasts reach, each hour go, caution,
/// no-go or not known by the Go / No-Go for a flight leaving then -- its
/// mark a shape of its own, not colour alone -- the best window said over
/// it, and a tap on an hour opening why, with its time and fuel. Its state
/// is DepartureWindow's.
struct DepartureWindowSection: View {
    @Environment(\.lookAccent) private var accent
    let model: DepartureWindow
    let signedIn: Bool
    let airplane: Bool

    var body: some View {
        Section {
            if !signedIn {
                Text("Sign in to see the hours to go across the next day.").foregroundStyle(.secondary)
            } else if let problem = model.problem {
                ProblemLine(problem)
            } else if let answer = model.answer {
                if answer.hours.isEmpty {
                    Text("No TAF along the route reaches past the next hour.").foregroundStyle(.secondary)
                } else {
                    if answer.windows.isEmpty, let last = answer.hours.last {
                        Text("No hour with nothing against it before \(DepartureWindow.clock(last.depart)).").foregroundStyle(.secondary)
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: WingtipSpace.sm) {
                            ForEach(answer.hours, id: \.depart) { hour in tile(hour) }
                        }
                        .padding(.vertical, WingtipSpace.xs)
                        .scrollTargetLayout()
                    }
                    // A flick comes to rest on an hour, not between two.
                    .scrollTargetBehavior(.viewAligned)
                    .accessibilityLabel("Departure hours")
                    if let hour = model.selected { detail(hour) }
                }
            } else if model.asking {
                ProgressView("Fetching the hours…")
            }
        } header: {
            Text(model.answer?.windows.first.map { DepartureWindow.bestLine($0, now: Date()) } ?? "When to Go")
        }
    }

    private func tile(_ hour: WindowHour) -> some View {
        let on = model.picked == hour.depart
        return Button { model.pick(hour.depart) } label: {
            VStack(spacing: WingtipSpace.xxs) {
                Text(String(DepartureWindow.clock(hour.depart).prefix(2))).font(.subheadline).monospacedDigit().foregroundStyle(Color.primary)
                Image(systemName: Self.symbol(hour.verdict)).foregroundStyle(Self.ink(hour.verdict))
                Image(systemName: "moon.fill").font(.caption2).foregroundStyle(.secondary).opacity(hour.night ? 1 : 0)
            }
            .frame(width: 44, height: 64)
            .background(Self.ink(hour.verdict).opacity(0.14), in: RoundedRectangle(cornerRadius: WingtipRadius.base))
            .overlay(RoundedRectangle(cornerRadius: WingtipRadius.base).strokeBorder(accent, lineWidth: on ? 2 : 0))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(DepartureWindow.label(hour))
        .accessibilityAddTraits(on ? .isSelected : [])
    }

    private func detail(_ hour: WindowHour) -> some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Label("\(DepartureWindow.word(hour.verdict)) leaving \(DepartureWindow.clock(hour.depart))", systemImage: Self.symbol(hour.verdict))
                .fontWeight(.semibold).foregroundStyle(Self.ink(hour.verdict))
            ForEach(hour.reasons) { reason in
                Text("\(Text(reason.label).fontWeight(.medium)) · \(reason.detail)").font(.subheadline)
            }
            if hour.night {
                Text("At night (14 CFR 1.1)" + (hour.nightPassengers ? "; with passengers, three full-stop landings in the last 90 days in 61.57(b)'s night period" : ""))
                    .font(.subheadline)
            }
            Text(DepartureWindow.figures(hour, airplane: airplane)).font(.subheadline).foregroundStyle(.secondary)
        }
    }

    static func symbol(_ verdict: String) -> String {
        switch verdict {
        case "go": "checkmark.circle.fill"
        case "caution": "exclamationmark.triangle.fill"
        case "no-go": "xmark.octagon.fill"
        default: "questionmark.circle"
        }
    }

    static func ink(_ verdict: String) -> Color {
        switch verdict {
        case "go": WingtipInk.go
        case "caution": WingtipInk.caution
        case "no-go": WingtipInk.problem
        default: Color.secondary
        }
    }
}
