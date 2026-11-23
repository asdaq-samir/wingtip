import Foundation
import Testing
@testable import Wingtip

/// Problems: what failed, said in the app's words, never the system's
/// ("The Internet connection appears to be offline.", a decoder's).
struct ProblemsTests {
    @Test(arguments: [URLError.Code.notConnectedToInternet, .networkConnectionLost, .cannotFindHost, .cannotConnectToHost,
                      .timedOut, .dataNotAllowed, .internationalRoamingOff])
    func noConnectionIsSaidAsSuch(_ code: URLError.Code) {
        #expect(Problems.words("The chart could not be fetched", URLError(code))
            == "No connection. The chart could not be fetched.")
        #expect(Problems.noConnection(URLError(code)))
    }

    @Test func anotherURLErrorIsNotNoConnection() {
        #expect(!Problems.noConnection(URLError(.badServerResponse)))
        #expect(Problems.words("The chart could not be fetched", URLError(.badServerResponse)) == "The chart could not be fetched.")
    }

    @Test func aRefusalSaysTheServersOwnWords() {
        let planner = Planner.Failure(status: 422, detail: "KXYZ is not an airport the FAA lists.")
        #expect(Problems.words("The route could not be planned", planner) == "The route could not be planned: KXYZ is not an airport the FAA lists.")
        let gateway = GatewayRefusal(status: 400, words: "Invalid request: totalHours must be at least 0")
        #expect(Problems.words("The change could not be kept", gateway) == "The change could not be kept: Invalid request: totalHours must be at least 0.")
    }

    @Test func aServerFailureKeepsItsDetailsToTheLog() {
        let planner = Planner.Failure(status: 502, detail: "upstream connect error or disconnect/reset before headers")
        #expect(Problems.words("The briefing could not be fetched", planner) == "The briefing could not be fetched.")
        #expect(Problems.words("The flights could not be fetched", GatewayRefusal(status: 400, words: nil)) == "The flights could not be fetched.")
        #expect(Problems.words("The plate could not be fetched", Planner.Failure(status: 404, detail: "Traceback (most recent call last):\n  File"))
            == "The plate could not be fetched: Traceback (most recent call last).")
    }

    @Test func theSystemsOwnTextIsNeverSaid() {
        let decoding = DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "The given data was not valid JSON."))
        #expect(Problems.say("The NOTAMs could not be fetched", decoding) == "The NOTAMs could not be fetched.")
        struct Other: LocalizedError { var errorDescription: String? { "The operation couldn’t be completed. (NSURLErrorDomain error -1.)" } }
        #expect(Problems.words("The squawk could not be added", Other()) == "The squawk could not be added.")
    }

    @Test func theAppsAndTheEnginesOwnWordsAreSaid() {
        #expect(Problems.words("The figures could not be worked out", AskRefused(why: "No airplane is picked"))
            == "The figures could not be worked out: No airplane is picked.")
        #expect(Problems.refusal(Engine.Refused(message: "The wind is too strong for a heading to KMSN to hold."), otherwise: "The hold could not be worked out")
            == "The wind is too strong for a heading to KMSN to hold.")
        #expect(Problems.refusal(URLError(.timedOut), otherwise: "The hold could not be worked out")
            == "No connection. The hold could not be worked out.")
    }

    @Test func whatFailedIsASentence() {
        #expect(Problems.words("the fuels could not be worked out.", URLError(.badURL)) == "The fuels could not be worked out.")
        #expect(Problems.words(Wording.notamsNotFetched, URLError(.notConnectedToInternet))
            == "No connection. The NOTAMs could not be fetched.")
    }
}
