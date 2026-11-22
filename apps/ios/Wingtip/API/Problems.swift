import Foundation
import os

/// An error whose words are written for the pilot: the app's own, or the
/// engine's for something typed ("not an altitude below 18,000 ft"), so
/// `Problems` says them after what failed.
protocol SaidToPilot: Error {
    var said: String { get }
}

extension Engine.Refused: SaidToPilot { var said: String { message } }
extension AskRefused: SaidToPilot { var said: String { why } }
extension WordsUnavailable: SaidToPilot { var said: String { why } }
extension SpeechSession.Refused: SaidToPilot { var said: String { errorDescription ?? "" } }

/// Why something the pilot asked for failed, as one plain sentence for the
/// screen where it happened, the iPhone's twin of Android's api/Problems
/// and the web's lib/problems. The system's own text -- "The Internet
/// connection appears to be offline.", "The data couldn't be read because
/// it isn't in the correct format.", a host and a port -- is not a pilot's
/// words, and about 150 places showed it word for word. Now it goes to the
/// log for a developer, and the screen says what failed and, where it can,
/// why: no connection, the server's own words where it refused the ask (a
/// 4xx carries words meant for the pilot, the gateway's ProblemDetail or
/// FastAPI's `detail`), or the app's and the engine's own words
/// (SaidToPilot). Sentences as decision 0021 has them: a capital first and
/// a full stop last.
enum Problems {
    private static let log = Logger(subsystem: Log.subsystem, category: "problems")

    /// `what` failed, as "The chart could not be fetched", given why: the
    /// sentence to show, the error logged.
    static func say(_ what: String, _ error: any Error) -> String {
        let type = String(describing: Swift.type(of: error))
        log.error("\(what, privacy: .public) (\(type, privacy: .public)): \(String(describing: error), privacy: .private)")
        return words(what, error)
    }

    /// The sentence alone, with nothing logged.
    static func words(_ what: String, _ error: any Error) -> String {
        let head = sentence(what)
        // No connection said first and as such, as the web's lib/problems
        // (NO_CONNECTION) and Android's Problems say it.
        if noConnection(error) { return "\(Wording.noConnection) \(head)." }
        if let why = reason(error) { return "\(head): \(why)." }
        return "\(head)."
    }

    /// What a refusal of something typed says: the engine's or the app's
    /// own words for it, alone ("The wind is too strong to hold here."),
    /// where it has them; otherwise `what` failed, as `say` puts it.
    static func refusal(_ error: any Error, otherwise what: String) -> String {
        guard error is any SaidToPilot, let why = reason(error) else { return say(what, error) }
        return sentence(why) + "."
    }

    /// Whether the ask got no answer for want of a network: no signal, the
    /// connection lost, the server not found or not reached, or no answer
    /// in time (URLError's own codes).
    static func noConnection(_ error: any Error) -> Bool {
        guard let code = (error as? URLError)?.code else { return false }
        return noConnectionCodes.contains(code)
    }

    private static let noConnectionCodes: Set<URLError.Code> = [
        .notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
        .timedOut, .dataNotAllowed, .internationalRoamingOff, .dnsLookupFailed,
    ]

    /// The words meant for the pilot an error carries, if it carries any:
    /// a refusal's (4xx) own, or the app's.
    private static func reason(_ error: any Error) -> String? {
        let words: String?
        switch error {
        case let failure as Planner.Failure: words = clientErrors.contains(failure.status) ? failure.detail : nil
        case let refusal as GatewayRefusal: words = clientErrors.contains(refusal.status) ? refusal.words : nil
        case let own as any SaidToPilot: words = own.said
        default: words = nil
        }
        // One line: a detail can run to a traceback, and a line is not the
        // place for one.
        let line = words?.split(separator: "\n").first.map(String.init) ?? ""
        let trimmed = line.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".:"))
        return trimmed.isEmpty ? nil : trimmed
    }

    private static let clientErrors = 400 ... 499

    /// `what` as the start of a sentence: its first letter a capital and
    /// no full stop of its own.
    private static func sentence(_ what: String) -> String {
        let trimmed = what.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".:"))
        guard let first = trimmed.first else { return trimmed }
        return first.uppercased() + trimmed.dropFirst()
    }
}
