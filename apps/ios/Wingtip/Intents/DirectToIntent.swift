import AppIntents

/// "Direct to KFCM" to Siri, in one breath: the app opened and the route
/// flown direct to the field from where the airplane is (RootView, the
/// same lookup the radio's Direct To chip uses). The field is an
/// AirportEntity, so the phrase carries it. A navaid or a fix, which no
/// airport entity names, goes by DirectToPlaceIntent, which asks.
struct DirectToIntent: CommandIntent {
    static let title: LocalizedStringResource = "Direct to an Airport"
    static let description = IntentDescription("Flies your route direct to an airport from where the airplane is.")
    static let openAppWhenRun: Bool = true
    @Dependency private var commands: AppCommands

    @Parameter(title: "Airport", requestValueDialog: "Direct to which airport?")
    var airport: AirportEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Direct to \(\.$airport)")
    }

    func appCommand() -> AppCommand? { .directTo(place: airport.id) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await handOver(to: commands)
        return .result(dialog: "Direct to \(airport.id).")
    }
}

/// "Direct to Gopher" to Siri: the place said -- a navaid, a fix or a
/// field -- found near the route as a clearance's is (RootView, the
/// engine's spoken places), where DirectToIntent takes only a field.
/// The place is free text, asked for after the phrase, since a phrase
/// carries only an entity or an enum.
struct DirectToPlaceIntent: CommandIntent {
    static let title: LocalizedStringResource = "Direct to a Fix"
    static let description = IntentDescription("Flies your route direct to a navaid, a fix or a field said by name from where the airplane is.")
    static let openAppWhenRun: Bool = true
    @Dependency private var commands: AppCommands

    @Parameter(title: "Place", requestValueDialog: "Direct to where?")
    var place: String

    static var parameterSummary: some ParameterSummary {
        Summary("Direct to \(\.$place)")
    }

    private var said: String { place.trimmingCharacters(in: .whitespacesAndNewlines) }

    func appCommand() -> AppCommand? { said.isEmpty ? nil : .directTo(place: said) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard !said.isEmpty else { return .result(dialog: "Say where to go direct to.") }
        await handOver(to: commands)
        return .result(dialog: "Direct to \(said).")
    }
}
