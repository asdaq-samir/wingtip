import SwiftUI

/// A stopwatch kept as the moment it was started and the time it had run
/// before that. The system's own timer text counts it (TimerRow), so
/// nothing counts in the background here, and the figure is right when
/// the display wakes and in the always-on display.
struct Stopwatch: Equatable {
    var startedAt: Date?
    var before: TimeInterval = 0

    var running: Bool { startedAt != nil }

    mutating func startOrStop(at now: Date) {
        if let startedAt {
            before += now.timeIntervalSince(startedAt)
            self.startedAt = nil
        } else {
            startedAt = now
        }
    }

    mutating func reset() {
        startedAt = nil
        before = 0
    }

    /// The span the system's timer text counts up over (Text(timerInterval:
    /// pauseTime:)): from the moment the stopwatch would have started had
    /// it never stopped, and, while stopped, where it was paused.
    func timer(at now: Date) -> (interval: ClosedRange<Date>, pause: Date?) {
        let from = (startedAt ?? now).addingTimeInterval(-before)
        return (from...Date.distantFuture, running ? nil : from.addingTimeInterval(before))
    }
}

/// Two timers: the flight's, started at takeoff for the fuel and the
/// log, and one for a hold or an approach (the outbound leg, the time
/// from the final approach fix). Each is started or stopped with one
/// tap and reset by holding.
struct TimersView: View {
    @State private var flight = Stopwatch()
    @State private var hold = Stopwatch()

    var body: some View {
        // A stock list: watchOS's own rows, spacing and corners.
        List {
            TimerRow(title: "Flight", stopwatch: $flight)
            TimerRow(title: "Hold / Approach", stopwatch: $hold)
        }
        .navigationTitle("Timers")
    }
}

struct TimerRow: View {
    let title: String
    @Binding var stopwatch: Stopwatch

    var body: some View {
        VStack(alignment: .leading) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            HStack {
                // The system's timer text: m:ss, and h:mm:ss past an hour,
                // as a cockpit timer reads, counted by the system each second.
                let timer = stopwatch.timer(at: Date())
                Text(timerInterval: timer.interval, pauseTime: timer.pause, countsDown: false, showsHours: true)
                    .font(.system(.title2, design: .rounded).monospacedDigit())
                    .foregroundStyle(stopwatch.running ? .primary : .secondary)
                Spacer()
                Button {
                    stopwatch.startOrStop(at: Date())
                } label: {
                    Image(systemName: stopwatch.running ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.bordered)
                .tint(stopwatch.running ? .orange : .green)
                .accessibilityLabel(stopwatch.running ? "Stop \(title) timer" : "Start \(title) timer")
            }
        }
        .contentShape(.rect)
        .onLongPressGesture { stopwatch.reset() }
        .accessibilityHint("Hold to reset")
    }
}
