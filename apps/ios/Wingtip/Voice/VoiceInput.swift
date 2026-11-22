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
/// Apple's own SpeechAnalyzer on this iPhone only (SpeechSession; the
/// owner, 2026-11-09): where English cannot be transcribed on the device
/// `canListen` is false and no microphone is shown.
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
    /// all, at `nothing`. The app's rule for a question's end: the
    /// analyzer settles words as it goes but never decides a question is
    /// over.
    private static let pause: TimeInterval = 1.5
    private static let longest: TimeInterval = 20
    private static let nothing: TimeInterval = 8

    private var session: SpeechSession?
    private var cut: Task<Void, Never>?
    private var cap: Task<Void, Never>?
    /// The words settled so far, and those said so far with the ones still
    /// changing after them.
    private var settled = ""
    private var said = ""

    /// Whether voice is offered here: English transcribed on this iPhone,
    /// never on a server.
    var canListen: Bool { SpeechSession.canListen }

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
            problem = "Speech cannot be recognized on this iPhone; type it instead."
            return nil
        }
        guard await ClearanceListener.allowed() else {
            problem = "Microphone or speech recognition access was refused; allow it for Wingtip Maps in Settings."
            return nil
        }
        let session = SpeechSession(.said)
        self.session = session
        listening = true
        settled = ""
        said = ""
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
            try await session.start(words: words) { [weak self] result in
                guard let self else { return }
                // Settled words kept; the words still changing after them.
                if result.final { self.settled += result.text }
                self.said = (result.final ? self.settled : self.settled + result.text).trimmingCharacters(in: .whitespaces)
                if !self.said.isEmpty { heard(self.said) }
                // A pause after the last words is the end of it.
                self.endAfter(Self.pause)
            }
        } catch {
            await close()
            problem = error.localizedDescription
            Log.radio.error("the microphone for a question would not start: \(error.localizedDescription, privacy: .public)")
            return nil
        }
        endAfter(Self.nothing)
        cap = Task { [weak self] in
            try? await Task.sleep(for: .seconds(Self.longest))
            if !Task.isCancelled { self?.finish() }
        }
        await session.finished()
        await close()
        let text = said.isEmpty ? nil : said
        if text == nil { problem = "Nothing was heard. Tap the microphone and speak your question." }
        return text
    }

    /// The mic tapped again: what was said so far is what was said.
    func finish() {
        let session = session
        Task { await session?.finish() }
    }

    private func endAfter(_ seconds: TimeInterval) {
        cut?.cancel()
        cut = Task { [weak self] in
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled { self?.finish() }
        }
    }

    private func close() async {
        listening = false
        cut?.cancel()
        cap?.cancel()
        await session?.cancel()
        session = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
