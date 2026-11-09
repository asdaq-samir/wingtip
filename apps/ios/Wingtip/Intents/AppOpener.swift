import Foundation

/// The app's side of the intents that open it on a screen (NearestAirportsIntent,
/// EmergencyIntent): the ask left for the root view to do once it is on the
/// screen (PendingCommand). The widget extension has its own AppOpener that
/// does nothing, since iOS runs these intents here.
enum AppOpener {
    @MainActor
    static func open(_ what: AppOpening) async {
        switch what {
        case .nearest: PendingCommand.shared.command = .nearest
        case .emergency: PendingCommand.shared.command = .open(.emergency)
        }
    }
}
