import AppIntents
import SwiftUI
import WidgetKit

/// Nearest Airport in Control Center, on the Lock Screen or on the Action
/// button (an iOS 18 control): one tap opens the app on the fields nearest
/// the phone, Siri's own NearestAirportsIntent.
struct NearestAirportControl: ControlWidget {
    static let kind = "app.wingtipmaps.nearest-control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: NearestAirportsIntent()) {
                // The in-flight Nearest button's glyph (InstrumentsBar).
                Label("Nearest Airport", systemImage: "airplane.arrival")
                    .controlWidgetActionHint("Show Nearest")
            }
            .tint(Color(WingtipColor.Chart.mapBlue))
        }
        .displayName("Nearest Airport")
        .description("Opens the airports nearest you, nearest first.")
    }
}

/// Emergency in Control Center, on the Lock Screen or on the Action button:
/// one tap opens the emergency assistant (EmergencyIntent), in the
/// emergency's red, as flying mode's Emergency button is.
struct EmergencyControl: ControlWidget {
    static let kind = "app.wingtipmaps.emergency-control"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: EmergencyIntent()) {
                Label("Emergency", systemImage: "exclamationmark.triangle.fill")
                    .controlWidgetActionHint("Open Emergency")
            }
            .tint(Color(WingtipColor.Chart.emergency))
        }
        .displayName("Emergency")
        .description("Opens the emergency assistant: the best fields within a glide, the checklist and the MAYDAY.")
    }
}

/// The extension's side of the intents that open the app: nothing, since
/// iOS runs them in the app, whose AppOpener does the work. Given to them
/// as the app gives its own (AppDependencyManager, WingtipWidgetsBundle).
final class AppOpener: Sendable {
    func open(_ what: AppOpening) async {}
}
