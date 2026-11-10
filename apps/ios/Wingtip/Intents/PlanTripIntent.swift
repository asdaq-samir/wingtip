import AppIntents
import Foundation

/// "Plan a trip to KLAS" to Siri or a Shortcut, in one breath: the field
/// an AirportEntity (so the phrase carries it; said as its ident, its
/// name or its town), and the app opened on a route to it from the
/// route's departure or the field nearest the airplane (RootView takes
/// the PendingCommand). At the owner's ask (2026-11-03): Apple's way to
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
struct PlanTripIntent: AppIntent {
    static let title: LocalizedStringResource = "Plan a Trip"
    static let description = IntentDescription("Plans a route to an airport, from your route's departure or the field nearest you, and briefs it for the time you say.")
    static let openAppWhenRun: Bool = true

    @Parameter(title: "Airport", requestValueDialog: "Where to?")
    var airport: AirportEntity

    @Parameter(title: "Departure", description: "When you plan to leave; the Brief opens on that hour.")
    var departure: Date?

    static var parameterSummary: some ParameterSummary {
        Summary("Plan a trip to \(\.$airport) leaving \(\.$departure)")
    }

    /// What the app is left to do: the route, and its Brief where a time was said.
    static func command(_ airport: AirportEntity, departure: Date?) -> PendingCommand.Command {
        departure == nil ? .planTo(ident: airport.id) : .brief(ident: airport.id)
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ident = airport.id
        let command = Self.command(airport, departure: departure)
        let when = departure
        await MainActor.run {
            if let when { BriefAsk.shared.expect(departAt: when) }
            PendingCommand.shared.command = command
        }
        guard let when else { return .result(dialog: "Planning a trip to \(ident).") }
        let said = when.formatted(.dateTime.weekday(.wide).hour().minute())
        return .result(dialog: IntentDialog(full: "Planning a trip to \(ident), leaving \(said). The Brief opens on that hour.", supporting: "\(ident), \(said)"))
    }
}
