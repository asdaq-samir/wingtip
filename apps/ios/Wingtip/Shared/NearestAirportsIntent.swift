import AppIntents

/// "Nearest airports" to Siri, and the Nearest Airport control in Control
/// Center and on the Lock Screen (NearestAirportControl): the app opened on
/// the Airport tab's Nearest list, the fields round the phone nearest
/// first (AirportShelf), as the microphone's Nearest Airports chip opens it
/// in the web app. Compiled into the app and the widget extension, which
/// draws the control; iOS runs it in the app, which it opens (AppOpener).
struct NearestAirportsIntent: AppIntent {
    static let title: LocalizedStringResource = "Nearest Airports"
    static let description = IntentDescription("Opens the airports nearest you, nearest first.")
    static let openAppWhenRun: Bool = true
    @Dependency private var opener: AppOpener

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await opener.open(.nearest)
        return .result(dialog: "Showing the nearest airports.")
    }
}

/// The emergency assistant, from Control Center, the Lock Screen or the
/// Action button (EmergencyControl), or Siri: the app opened on it -- the
/// best fields within a glide, the emergency checklist and the MAYDAY --
/// as flying mode's Emergency button opens it. One tap with the phone
/// locked, when the pilot has no time to find it.
struct EmergencyIntent: AppIntent {
    static let title: LocalizedStringResource = "Emergency Assistant"
    static let description = IntentDescription("Opens the emergency assistant: the best fields within a glide, the checklist and the MAYDAY.")
    static let openAppWhenRun: Bool = true
    @Dependency private var opener: AppOpener

    func perform() async throws -> some IntentResult {
        await opener.open(.emergency)
        return .result()
    }
}

/// What a control or Siri opens the app on, by name, so the widget
/// extension, which has none of the app's screens, can say it.
enum AppOpening: Sendable {
    case nearest, emergency
}
