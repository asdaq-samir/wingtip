import Foundation

/// What went wrong, in the app's words rather than the system's (the
/// errors-and-onboarding audit, owner rec 5; the web's describeError and
/// lib/problems' NO_CONNECTION): a lost or absent connection is "No
/// connection" where URLSession said "The Internet connection appears to
/// be offline.", a timeout says to try again, and an answer that is not
/// the JSON asked for is said as garbled, not in the decoder's words. A
/// refusal keeps the planner's or the gateway's own words (Planner.Failure,
/// GatewayRefusal); anything else its own description.
extension Error {
    var said: String {
        if let url = self as? URLError { return ErrorWords.said(url) }
        if self is DecodingError { return Wording.answerGarbled }
        if let failure = self as? Planner.Failure, failure.detail == nil, failure.status >= 500 { return Wording.plannerNotAnswering }
        return localizedDescription
    }
}

enum ErrorWords {
    /// Whether the request failed for want of a network: no connection,
    /// one dropped, the host not to be reached.
    static func offline(_ error: URLError) -> Bool {
        [.notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff,
         .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains(error.code)
    }

    static func said(_ error: URLError) -> String {
        if offline(error) { return Wording.noConnection + "." }
        if error.code == .timedOut { return Wording.noAnswerInTime }
        return error.localizedDescription
    }
}
