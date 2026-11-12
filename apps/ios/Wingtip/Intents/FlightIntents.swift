import AppIntents
import Foundation

/// "Start my flight in Wingtip Maps": the flight's Live Activity started
/// from the route kept on the phone, as the Start Flight control starts
/// it (FlightSwitch), with Ready to Fly's look after where something is
/// missing. A LiveActivityIntent, so it starts from Siri without the app
/// on the screen.
struct StartFlightIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Start Flight"
    static let description = IntentDescription("Shows your planned flight on the Lock Screen and in the Dynamic Island.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        if let problem = await FlightSwitch.set(true) { return .result(dialog: IntentDialog(stringLiteral: problem)) }
        let route = Kept.load().map { "\($0.dep) to \($0.dest)" } ?? "your flight"
        return .result(dialog: IntentDialog(full: "Started \(route). It's on the Lock Screen.", supporting: "Started \(route)"))
    }
}

/// "Keep this flight for the air": the route's charts, briefing, NOTAMs,
/// airport cards and plates kept on the phone for no signal, as FPL's
/// Keep for the Air button keeps them (KeepForAir, through RootView).
struct KeepForAirIntent: CommandIntent {
    static let title: LocalizedStringResource = "Keep for the Air"
    static let description = IntentDescription("Keeps your route's charts, briefing, NOTAMs, airport cards and plates on this iPhone for flying with no signal.")
    static let openAppWhenRun: Bool = true

    func appCommand() -> AppCommand? { .keepForAir }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        return .result(dialog: "Keeping your flight for the air.")
    }
}

/// "Log this flight": the flight that ended, drafted from its track by
/// the engine (logbook_from_track, through the planner) and shown for the
/// pilot to check and log -- never logged unasked. With no flight ended
/// on the phone, the logbook.
struct LogFlightIntent: CommandIntent {
    static let title: LocalizedStringResource = "Log This Flight"
    static let description = IntentDescription("Opens the entry drafted from the flight you just flew, for you to check and log.")
    static let openAppWhenRun: Bool = true

    /// The app's automatic logbook, given by App Intents (WingtipApp).
    @Dependency private var autoLogbook: AutoLogbook

    /// The flight's entry is up already where one ended; else the logbook.
    func appCommand() -> AppCommand? { autoLogbook.isOpen ? nil : .open(.logbook) }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let ended = await MainActor.run { autoLogbook.isOpen }
        return .result(dialog: ended ? "Here's the entry from your flight; check it and log it."
            : "No flight has ended on this iPhone yet. Here's your logbook.")
    }
}

/// "Am I ready to fly?": the engine's Ready to Fly (ready_to_fly) for the
/// route on the phone -- charts, packs, the briefing's age, NOTAMs,
/// battery, position -- said as its line and the things to do, the
/// engine's own words.
struct ReadyToFlyIntent: AppIntent {
    static let title: LocalizedStringResource = "Ready to Fly"
    static let description = IntentDescription("Checks this iPhone is ready to fly your route with no signal: charts, data, briefing, NOTAMs, battery and position.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView {
        let answer = await MainActor.run { () -> ReadyAnswerWords? in
            ReadyToFly.shared.answer.map(ReadyAnswerWords.init)
        }
        await ReadyToFly.shared.refresh()
        let fresh = await MainActor.run { ReadyToFly.shared.answer.map(ReadyAnswerWords.init) } ?? answer
        guard let fresh else {
            return .result(dialog: "Open your route in Wingtip Maps first, and I'll check it.", view: SiriLines(title: "Ready to Fly", lines: []))
        }
        return .result(dialog: IntentDialog(full: "\(fresh.spoken)", supporting: "\(fresh.line)"), view: SiriLines(title: fresh.line, lines: fresh.actions))
    }
}

/// Ready to Fly's answer as Siri says it: the line, then each thing to do.
struct ReadyAnswerWords: Sendable {
    let line: String
    let actions: [String]

    init(_ answer: EngineContract.ReadyToFlyAnswer) {
        line = answer.line
        actions = answer.actions.map(\.line)
    }

    var spoken: String { ([line] + actions).map { $0.hasSuffix(".") ? $0 : $0 + "." }.joined(separator: " ") }
}

/// "Direct to the nearest airport": the field nearest the airplane (the
/// planner's nearest, from the phone's position), said with its distance
/// and course as the planner gives them, and confirmed before the route
/// changes -- Siri's follow-up -- then flown direct (RootView).
struct DirectToNearestIntent: AppIntent {
    static let title: LocalizedStringResource = "Direct to the Nearest Airport"
    static let description = IntentDescription("Finds the airport nearest you and, once you confirm, flies your route direct to it.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog & OpensIntent {
        guard let here = await SiriPosition.now() else {
            return .result(opensIntent: OpenWingtipIntent(), dialog: "I can't tell where you are, so here are the nearest airports.")
        }
        guard let field = try? await Planner.nearest(lat: here.latitude, lon: here.longitude, limit: 1).first else {
            return .result(opensIntent: OpenWingtipIntent(), dialog: "The nearest airport couldn't be found; here's the list.")
        }
        let said = "\(field.ident), \(Format.spokenDistance(field.distanceNm)), \(Format.spokenHeadingTrue(field.bearingDeg))"
        try await requestConfirmation(actionName: .go, dialog: IntentDialog(full: "The nearest is \(said). Go direct?", supporting: "Direct to \(field.ident)?"))
        return .result(opensIntent: OpenWingtipIntent(directTo: field.ident), dialog: "Direct to \(field.ident).")
    }
}

/// The app opened on what an intent that asked first leaves it to do:
/// Direct To the nearest once confirmed, else the nearest airports where
/// none was found. Not offered on its own.
struct OpenWingtipIntent: CommandIntent {
    static let title: LocalizedStringResource = "Open Wingtip Maps"
    static let openAppWhenRun: Bool = true
    static let isDiscoverable: Bool = false

    @Parameter(title: "Direct To")
    var directTo: String?

    init() {}

    init(directTo: String?) {
        self.directTo = directTo
    }

    func appCommand() -> AppCommand? { directTo.map { .directTo(place: $0) } ?? .nearest }

    func perform() async throws -> some IntentResult {
        return .result()
    }
}
