import AppIntents

/// "Start recording in Wingtip Maps": the radio listened to and written
/// out as FPL's microphone button does it (ClearanceListener), the calls
/// to us read by the ATC copilot. The app is opened, since iOS lets an app
/// turn the microphone on only from the screen. Nothing is kept as sound:
/// what is heard becomes words on the phone.
struct StartListeningIntent: AppIntent {
    static let title: LocalizedStringResource = "Start Listening to the Radio"
    static let description = IntentDescription("Listens to the radio through the microphone and writes out what ATC says.")
    static let openAppWhenRun: Bool = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let (listening, problem) = await RadioSwitch.start()
        guard listening else { return .result(dialog: IntentDialog(stringLiteral: problem ?? "The microphone could not be used.")) }
        return .result(dialog: "Listening to the radio.")
    }
}

/// "Stop recording in Wingtip Maps": the radio no longer listened to,
/// without opening the app.
struct StopListeningIntent: AppIntent {
    static let title: LocalizedStringResource = "Stop Listening to the Radio"
    static let description = IntentDescription("Stops listening to the radio.")
    static let openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let was = await RadioSwitch.stop()
        return .result(dialog: was ? "Stopped listening to the radio." : "Wingtip Maps wasn't listening to the radio.")
    }
}

/// The two intents' work on the listener, on the main actor it lives on.
@MainActor
enum RadioSwitch {
    /// Listening, if it can be: whether it is, and why not.
    static func start(_ listener: ClearanceListener = .shared) async -> (Bool, String?) {
        if !listener.listening { await listener.start(words: []) }
        return (listener.listening, listener.problem)
    }

    /// Whether it was listening; it is not now.
    static func stop(_ listener: ClearanceListener = .shared) -> Bool {
        let was = listener.listening
        if was { listener.stop() }
        return was
    }
}
