import AVFoundation
import Foundation
import Observation
import Speech

/// Ask by voice: the pilot says one thing to the app -- a search, a route,
/// a question -- and the words appear in the field as they are said, as
/// the keyboard's dictation types them. A feature of its own, apart from
/// listening to the radio (ClearanceListener, the radio's captions, the
/// ATC card and the Live Activity): the owner, 2026-11-10, "the mic is a
/// speaking feature for a pilot to ask anything vs radio listening is a
/// separate feature. So they should not share animations." So it keeps
/// its own state, and the radio's views never read it.
///
/// Apple's own recognizer on this iPhone only (requiresOnDeviceRecognition,
/// always; the owner, 2026-11-09): where English cannot be recognised on
/// the device `canListen` is false and no microphone is shown.
@MainActor
@Observable
final class VoiceInput {
    static let shared = VoiceInput()

    /// Listening for the pilot's words now.
    private(set) var listening = false
    /// Why it could not listen, in a pilot's words.
    private(set) var problem: String?

    /// A thing said is over this long after its last word, seconds, and
    /// at `longest` whatever is still being said; with nothing said at
    /// all, at `nothing`.
    private static let pause: TimeInterval = 1.5
    private static let longest: TimeInterval = 20
    private static let nothing: TimeInterval = 8

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private let audio = AVAudioEngine()
    private let feed = Feed()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var cut: Task<Void, Never>?
    /// The words so far of the thing being said.
    private var said: String?

    /// Whether voice is offered here: English recognised on this iPhone,
    /// never on a server.
    var canListen: Bool { recognizer?.supportsOnDeviceRecognition == true }

    /// One thing said: `heard` gets the words so far as they come, for the
    /// field to show; the whole is returned once a pause ends them, or
    /// `finish` is called (the mic tapped again). Nil with `problem` set
    /// where the microphone cannot be had, or while the radio is being
    /// listened to, which has the microphone.
    func hear(words: [String] = [], heard: @escaping @MainActor (String) -> Void = { _ in }) async -> String? {
        guard !listening else { return nil }
        problem = nil
        let radio = ClearanceListener.shared
        guard !radio.listening, !radio.hearingOnce else {
            problem = "The radio is being listened to; stop it to ask by voice."
            return nil
        }
        guard canListen else {
            problem = "Speech can't be recognised on this iPhone; type it instead."
            return nil
        }
        guard await ClearanceListener.allowed() else {
            problem = "Microphone or speech recognition access was refused; allow it for Wingtip Maps in Settings."
            return nil
        }
        guard let recognizer, recognizer.isAvailable else {
            problem = "Speech recognition is not available now."
            return nil
        }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.record, mode: .measurement, options: .duckOthers)
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            try Self.tap(audio.inputNode, into: feed)
            audio.prepare()
            try audio.start()
        } catch {
            close()
            problem = "No microphone could be used."
            Log.radio.error("the microphone for a question would not start: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.taskHint = .search
        request.contextualStrings = words
        // On the iPhone, never Apple's servers.
        request.requiresOnDeviceRecognition = true
        self.request = request
        feed.set(request)
        listening = true
        said = nil
        let once = Once<String?>()
        let text: String? = await withCheckedContinuation { done in
            once.hold(done)
            task = recognizer.recognitionTask(with: request) { [weak self, weak request] result, error in
                let text = result?.bestTranscription.formattedString
                let final = result?.isFinal == true || error != nil
                Task { @MainActor in
                    guard let self else { once.resume(nil); return }
                    if let text, !text.isEmpty {
                        self.said = text
                        heard(text)
                    }
                    if final {
                        once.resume(self.said)
                        return
                    }
                    // A pause after the last words is the end of it.
                    self.cut?.cancel()
                    self.cut = Task { [weak request] in
                        try? await Task.sleep(for: .seconds(Self.pause))
                        if !Task.isCancelled { request?.endAudio() }
                    }
                }
            }
            cut = Task { [weak request] in
                try? await Task.sleep(for: .seconds(Self.nothing))
                if !Task.isCancelled { request?.endAudio() }
            }
            Task { [weak request] in
                try? await Task.sleep(for: .seconds(Self.longest))
                request?.endAudio()
            }
        }
        close()
        if text?.isEmpty ?? true { problem = "Nothing was heard. Tap the microphone and speak your question." }
        return text
    }

    /// The mic tapped again: what was said so far is what was said.
    func finish() {
        request?.endAudio()
    }

    private func close() {
        listening = false
        cut?.cancel()
        if audio.isRunning { audio.stop() }
        audio.inputNode.removeTap(onBus: 0)
        task?.cancel()
        task = nil
        request = nil
        feed.set(nil)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// The microphone's tap, made off the main actor: its block runs on
    /// the audio thread. iOS 27's throwing installTap; the 27.2 SDK
    /// imports its NSError out-parameter as `error: ()` under the
    /// refined name, so it is called by that name.
    private nonisolated static func tap(_ input: AVAudioInputNode, into feed: Feed) throws {
        try input.__installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0), error: ()) { buffer, _ in feed.append(buffer) }
    }
}
