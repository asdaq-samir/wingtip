import AppIntents
import Foundation

/// "Plan a trip to KLAS" to Siri or a Shortcut, in one breath: the field
/// an AirportEntity (so the phrase carries it; said as its ident, its
/// name or its town), and the app opened on a route to it from the
/// route's departure or the field nearest the airplane (RootView takes
/// its command). At the owner's ask (2026-11-03): Apple's way to
/// Siri, Shortcuts and Spotlight is App Intents, so what the microphone
/// takes in the app Siri takes outside it too. A town or an address said
/// when Siri asks is found as the microphone finds one (AirportEntityQuery,
/// IntentLookups.field): the biggest field by it.
///
/// "Plan a flight to Oshkosh tomorrow at 9": the time is an optional
/// date Siri fills from what was said; given, the Brief opens on the
/// route with its departure window's hour nearest that time picked
/// (BriefAsk, DepartureWindow.pick(nearest:)), the planner's figures for
/// that hour, never the model's.
struct PlanTripIntent: CommandIntent {
    static let title: LocalizedStringResource = "Plan a Trip"
    static let description = IntentDescription("Plans a route to an airport, from your route's departure or the field nearest you, and briefs it for the time you say.")
    static let openAppWhenRun: Bool = true

    /// The app's Brief ask, given by App Intents (WingtipApp).
    @Dependency private var briefAsk: BriefAsk

    @Parameter(title: "Airport", requestValueDialog: "Where to?")
    var airport: AirportEntity

    @Parameter(title: "Departure", description: "When you plan to leave; the Brief opens on that hour.")
    var departure: Date?

    static var parameterSummary: some ParameterSummary {
        Summary("Plan a trip to \(\.$airport) leaving \(\.$departure)")
    }

    /// What the app is left to do: the route, and its Brief where a time was said.
    static func command(_ airport: AirportEntity, departure: Date?) -> AppCommand {
        departure == nil ? .planTo(ident: airport.id) : .brief(ident: airport.id)
    }

    /// The hour said is left with the Brief as the route is asked for.
    func appCommand() -> AppCommand? {
        if let departure { briefAsk.expect(departAt: departure) }
        return Self.command(airport, departure: departure)
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ident = airport.id
        let when = departure
        guard let when else { return .result(dialog: "Planning a trip to \(ident).") }
        let said = when.formatted(.dateTime.weekday(.wide).hour().minute())
        return .result(dialog: IntentDialog(full: "Planning a trip to \(ident), leaving \(said). The Brief opens on that hour.", supporting: "\(ident), \(said)"))
    }
}
