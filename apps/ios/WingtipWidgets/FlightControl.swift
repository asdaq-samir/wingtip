import AppIntents
import SwiftUI
import WidgetKit

/// Start flight / stop flight in Control Center, on the Lock Screen or on
/// the Action button (an iOS 18 control): a toggle whose state is whether
/// the flight's Live Activity is running (FlightControlState, which the
/// app keeps in the App Group), and whose intent starts or ends it in the
/// app (FlightControlIntent).
struct FlightControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: FlightControlState.kind, provider: Provider()) { running in
            ControlWidgetToggle("Flight", isOn: running, action: FlightControlIntent()) { on in
                Label(on ? "Flying" : "Start Flight", systemImage: on ? "airplane.circle.fill" : "airplane")
                    // The Action button's hint, a verb (HIG Controls).
                    .controlWidgetActionHint(on ? "End Flight" : "Start Flight")
            }
            .tint(Color(WingtipColor.Chart.mapBlue))
        }
        .displayName("Flight")
        .description("Shows your planned flight on the Lock Screen and in the Dynamic Island, or ends it.")
    }

    struct Provider: ControlValueProvider {
        var previewValue: Bool { false }

        func currentValue() async throws -> Bool { FlightControlState.read() }
    }
}

/// The extension's side of FlightControlIntent: nothing, since iOS runs a
/// LiveActivityIntent in the app, whose FlightSwitch does the work.
enum FlightSwitch {
    static func set(_ on: Bool) async -> String? { nil }
}
