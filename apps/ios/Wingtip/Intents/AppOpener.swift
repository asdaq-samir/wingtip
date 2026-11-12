import AppIntents
import Foundation

/// The app's side of the intents that open it on a screen
/// (NearestAirportsIntent, EmergencyIntent, compiled into the widget
/// extension too, whose AppOpener does nothing since iOS runs these
/// here): their command, done by the root view on the screen. Given to
/// them as a dependency (AppDependencyManager, WingtipApp).
@MainActor
final class AppOpener {
    let commands: AppCommands

    nonisolated init(commands: AppCommands) {
        self.commands = commands
    }

    static func command(_ what: AppOpening) -> AppCommand {
        switch what {
        case .nearest: .nearest
        case .emergency: .open(.emergency)
        }
    }

    /// Before iOS 26 only: from then the system hands the intent to the
    /// scene itself (IntentScenes).
    func open(_ what: AppOpening) async {
        if #available(iOS 26, *) { return }
        commands.waiting = Self.command(what)
    }
}

extension NearestAirportsIntent: CommandIntent {
    func appCommand() -> AppCommand? { AppOpener.command(.nearest) }
}

extension EmergencyIntent: CommandIntent {
    func appCommand() -> AppCommand? { AppOpener.command(.emergency) }
}
