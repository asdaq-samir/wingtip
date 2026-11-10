import AppIntents

/// The app's shortcuts, which Siri takes without setting up: each phrase
/// names the app, and the airport in it is an AirportEntity, so "Plan a
/// trip to KLAS in Wingtip Maps" goes in one breath. Siri listens for the
/// fields the entity suggests (the kept route's, the Favorites, the
/// Recents: AirportEntityQuery.suggestedEntities), so the app calls
/// `updateAppShortcutParameters()` when those change. A navaid or a fix
/// for Direct To is free text, asked for after the phrase. Shown in the
/// Shortcuts app and Spotlight as well. Apple allows ten; these are nine.
struct WingtipShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: PlanTripIntent(),
            phrases: [
                "Plan a trip to \(\.$airport) in \(.applicationName)",
                "Plan a flight to \(\.$airport) in \(.applicationName)",
                "Fly to \(\.$airport) in \(.applicationName)",
                "Plan a trip in \(.applicationName)",
            ],
            shortTitle: "Plan a Trip",
            systemImageName: "airplane")
        AppShortcut(
            intent: BriefFlightIntent(),
            phrases: [
                "Brief my flight to \(\.$airport) in \(.applicationName)",
                "Brief a flight to \(\.$airport) in \(.applicationName)",
                "Brief me for \(\.$airport) in \(.applicationName)",
                "Brief my flight in \(.applicationName)",
            ],
            shortTitle: "Brief a Flight",
            systemImageName: "checklist")
        AppShortcut(
            intent: NearestAirportsIntent(),
            phrases: [
                "Nearest airports in \(.applicationName)",
                "Show the nearest airports in \(.applicationName)",
            ],
            shortTitle: "Nearest Airports",
            systemImageName: "mappin.and.ellipse")
        // The assistant by its name, never "emergency" alone, which is
        // the phone's own Emergency SOS to Siri.
        AppShortcut(
            intent: EmergencyIntent(),
            phrases: [
                "Open the emergency assistant in \(.applicationName)",
                "Emergency assistant in \(.applicationName)",
            ],
            shortTitle: "Emergency Assistant",
            systemImageName: "exclamationmark.triangle.fill")
        AppShortcut(
            intent: WeatherAtIntent(),
            phrases: [
                "Weather at \(\.$airport) in \(.applicationName)",
                "Get the weather at \(\.$airport) in \(.applicationName)",
                "Weather in \(.applicationName)",
            ],
            shortTitle: "Weather at an Airport",
            systemImageName: "cloud.sun")
        AppShortcut(
            intent: DirectToIntent(),
            phrases: [
                "Direct to \(\.$airport) in \(.applicationName)",
                "Go direct to \(\.$airport) in \(.applicationName)",
            ],
            shortTitle: "Direct to an Airport",
            systemImageName: "location.north.line")
        AppShortcut(
            intent: StartFlightIntent(),
            phrases: [
                "Start my flight in \(.applicationName)",
                "Start flight in \(.applicationName)",
            ],
            shortTitle: "Start Flight",
            systemImageName: "airplane.departure")
        AppShortcut(
            intent: LogFlightIntent(),
            phrases: [
                "Log this flight in \(.applicationName)",
                "Log my flight in \(.applicationName)",
            ],
            shortTitle: "Log This Flight",
            systemImageName: "book.closed")
        AppShortcut(
            intent: ReadyToFlyIntent(),
            phrases: [
                "Am I ready to fly in \(.applicationName)",
                "Ready to fly in \(.applicationName)",
            ],
            shortTitle: "Ready to Fly",
            systemImageName: "checkmark.seal")
        AppShortcut(
            intent: KeepForAirIntent(),
            phrases: [
                "Keep my flight for the air in \(.applicationName)",
                "Keep for the air in \(.applicationName)",
            ],
            shortTitle: "Keep for the Air",
            systemImageName: "arrow.down.circle")
    }
}
