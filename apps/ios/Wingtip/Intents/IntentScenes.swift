import AppIntents
import SwiftUI

/// The ways a command reaches the root view from outside the app: a link
/// (the site's universal links, the app's own scheme, a file from Files or
/// Mail), and Siri, a Shortcut, Spotlight or a control, each intent
/// handed by the system to the scene on the screen
/// (`onAppIntentExecution`, before the intent's `perform`).
struct CommandHost: ViewModifier {
    /// The root view's run of a command, then the screen named after it.
    let run: @MainActor (AppCommand, Screen?) async -> Void
    @Environment(Session.self) private var session

    func body(content: Content) -> some View {
        content.modifier(IntentScenes { command in Task { await run(command, nil) } })
            // A route, a field or an airplane shared from the site, or a
            // track file, is a command (Links); a screen named beside a route
            // opens once it is in. The sign-in link from Mail has its token
            // handed to the gateway, and the pilot is signed in without a
            // browser (Session.open).
            .onOpenURL { url in
                guard let command = Links.command(for: url) else {
                    Task { await session.open(url) }
                    return
                }
                let then: Screen? = switch command {
                case .open, .sharedFlight: nil
                default: Links.screen(for: url)
                }
                Task { await run(command, then) }
            }
    }
}

/// Each intent that opens the app on a command, handed to the scene by
/// the system (TargetContentProvidingIntent).
private struct IntentScenes: ViewModifier {
    let run: @MainActor (AppCommand) -> Void

    func body(content: Content) -> some View {
        content
            .runs(PlanTripIntent.self, run)
            .runs(BriefFlightIntent.self, run)
            .runs(DirectToIntent.self, run)
            .runs(DirectToPlaceIntent.self, run)
            .runs(OpenWingtipIntent.self, run)
            .runs(KeepForAirIntent.self, run)
            .runs(LogFlightIntent.self, run)
            .runs(FlyAirplaneIntent.self, run)
            .runs(AddApproachIntent.self, run)
            .runs(OpenAirportIntent.self, run)
            .runs(OpenFlightIntent.self, run)
            .runs(OpenLogbookEntryIntent.self, run)
            .runs(NearestAirportsIntent.self, run)
            .runs(EmergencyIntent.self, run)
    }
}

private extension View {
    func runs<I: TargetContentProvidingIntent & CommandIntent>(_ intent: I.Type, _ run: @escaping @MainActor (AppCommand) -> Void) -> some View {
        onAppIntentExecution(intent) { if let command = $0.appCommand() { run(command) } }
    }
}

extension PlanTripIntent: TargetContentProvidingIntent {}
extension BriefFlightIntent: TargetContentProvidingIntent {}
extension DirectToIntent: TargetContentProvidingIntent {}
extension DirectToPlaceIntent: TargetContentProvidingIntent {}
extension OpenWingtipIntent: TargetContentProvidingIntent {}
extension KeepForAirIntent: TargetContentProvidingIntent {}
extension LogFlightIntent: TargetContentProvidingIntent {}
extension FlyAirplaneIntent: TargetContentProvidingIntent {}
extension AddApproachIntent: TargetContentProvidingIntent {}
extension OpenAirportIntent: TargetContentProvidingIntent {}
extension OpenFlightIntent: TargetContentProvidingIntent {}
extension OpenLogbookEntryIntent: TargetContentProvidingIntent {}
extension NearestAirportsIntent: TargetContentProvidingIntent {}
extension EmergencyIntent: TargetContentProvidingIntent {}

extension NearestAirportsIntent: CommandIntent {
    func appCommand() -> AppCommand? { .nearest }
}

extension EmergencyIntent: CommandIntent {
    func appCommand() -> AppCommand? { .open(.emergency) }
}
