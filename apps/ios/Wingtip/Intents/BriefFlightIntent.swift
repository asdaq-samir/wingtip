import AppIntents

/// "Brief my flight to Oshkosh" to Siri, in one breath: the app opened on
/// the Brief -- the verdict, the weather and the findings -- for a route to
/// the field, from the route's departure or the field nearest the airplane,
/// as "plan a trip to" plans it (RootView's commands, then BriefAsk). The
/// field is an AirportEntity, so its name or its town ("Oshkosh") finds it.
struct BriefFlightIntent: CommandIntent {
    static let title: LocalizedStringResource = "Brief a Flight"
    static let description = IntentDescription("Opens the Brief for a route to an airport, from your route's departure or the field nearest you.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Airport", requestValueDialog: "Brief a flight to where?")
    var airport: AirportEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Brief a flight to \(\.$airport)")
    }

    /// What the app is left to do for the field.
    static func command(_ airport: AirportEntity) -> AppCommand { .brief(ident: airport.id) }

    func appCommand() -> AppCommand? { Self.command(airport) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        return .result(dialog: "Briefing your flight to \(airport.id).")
    }
}
