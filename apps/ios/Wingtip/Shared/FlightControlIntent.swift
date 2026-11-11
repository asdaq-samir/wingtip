import AppIntents
import Foundation

/// Whether a flight is running on the Lock Screen, as the Control Center
/// control shows it (FlightControl in the widget extension): the app
/// writes it into the App Group whenever its Live Activity starts or ends
/// (FlightActivity), and the control reads it. Compiled into both.
enum FlightControlState {
    /// The control's kind, which the app names to have it drawn again.
    static let kind = "app.wingtipmaps.flight-control"
    static let key = "flightRunning"

    static func read(from store: UserDefaults? = WidgetSnapshot.store) -> Bool {
        store?.bool(forKey: key) ?? false
    }

    static func write(running: Bool, to store: UserDefaults? = WidgetSnapshot.store) {
        store?.set(running, forKey: key)
    }
}

/// Start flight / stop flight, from Control Center, the Lock Screen or
/// the Action button: the flight's Live Activity started from the route
/// kept on the phone, or ended. A LiveActivityIntent, so iOS runs it in
/// the app's process, where the activity is (FlightSwitch), even when the
/// control in the widget extension is what was tapped.
struct FlightControlIntent: SetValueIntent, LiveActivityIntent {
    static let title: LocalizedStringResource = "Start or Stop the Flight"
    static let description = IntentDescription("Shows your planned flight on the Lock Screen and in the Dynamic Island, or ends it.")

    @Parameter(title: "Flying")
    var value: Bool

    init() {}

    init(value: Bool) { self.value = value }

    func perform() async throws -> some IntentResult {
        if let problem = await FlightSwitch.set(value) { throw FlightControlProblem(words: problem) }
        return .result()
    }
}

/// Why the flight could not be started, said where it was asked.
struct FlightControlProblem: Error, CustomLocalizedStringResourceConvertible {
    let words: String
    var localizedStringResource: LocalizedStringResource { "\(words)" }
}
