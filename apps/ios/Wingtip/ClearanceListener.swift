import AVFoundation
import Foundation
import Observation
import Speech
import UIKit

/// The radio heard through the microphone by Apple's SpeechAnalyzer
/// (SpeechSession: the Speech framework's on-device transcriber, iOS 26),
/// a transmission at a time as its results settle, on the iPhone only, so
/// nothing a pilot says goes to Apple or anyone (the owner, 2026-11-09);
/// and told the names near the route to listen for (its context,
/// /api/clearance/words) -- a fix said as a word, "Pykla", is not English.
///
/// Where the iPhone cannot transcribe English on the device (an older
/// phone, the language not supported), voice is not offered at all:
/// `canListen` is false and every microphone control hides itself, and
/// nothing falls back to a server.
///
/// It goes on while the app is in front: the `audio` background mode that
/// kept the microphone open with the phone locked (the owner, 2026-11-02)
/// is out of the first submission's build with the ATC Copilot parked (the
/// feature review, 2026-11-21; project.yml). A call to us (HeardCall) put
/// away is said in a notification (Notifications), with the haptics in
/// the app. Asked for with the system's own sheets (project.yml's usage
/// strings). The radio is listened to only while the ATC Copilot is on in
/// Settings' Extras (Extra), whoever asks: the copilot, the clearance's
/// Listen and Read back, or a shortcut.
@MainActor
@Observable
final class ClearanceListener {
    static let shared = ClearanceListener()

    struct Transmission: Identifiable, Equatable {
        let id: Int
        let at: Date
        var text: String
        var final: Bool
        var forUs: Bool
    }

    private(set) var heard: [Transmission] = []
    /// The radio being listened to.
    var listening: Bool {
        if case .radio(_, live: true) = state { true } else { false }
    }
    /// Why it could not listen, in a pilot's words.
    private(set) var problem: String?
    /// The last call to us put away.
    var seen: Int?
    /// The clearance sheet, opened from the captions or a call's Enter
    /// Route, and the words it was opened with.
    var sheetShown = false
    var sheetText: String?
    /// The airplane whose calls are ours: the plan's registration.
    var tail: String?

    /// The newest call to us not yet put away, settled.
    var call: Transmission? {
        guard let last = heard.last(where: { $0.forUs && $0.final }), last.id != seen else { return nil }
        return last
    }

    /// The microphone open for one thing said to the radio's own screens
    /// -- a readback (hearOnce). The pilot asking the app by voice is
    /// VoiceInput's, apart from the radio.
    var hearingOnce: Bool {
        if case .once = state { true } else { false }
    }
    /// The words of it so far, and those of them settled.
    private var heardOnce: String?
    private var settledOnce = ""

    /// As many transmissions as are kept.
    private static let kept = 60
    /// A question is over this long after its last word, seconds, and
    /// at `longestOnce` whatever is still being said: the app's rule, as
    /// the analyzer settles words but never ends a question.
    private static let pause: TimeInterval = 1.5
    private static let longestOnce: TimeInterval = 20

    /// Whether voice is offered here: English transcribed on this iPhone,
    /// never on a server. Every microphone control shows only when it is.
    var canListen: Bool { SpeechSession.canListen }

    /// What the microphone is doing: one session at a time, by its type.
    /// A resumed radio, or a readback asked for while another starts,
    /// replaces the session held, which is cancelled first (`begin`).
    private enum State {
        case idle
        /// The radio's session; live once it has started.
        case radio(SpeechSession, live: Bool)
        /// One thing said, a readback.
        case once(SpeechSession)
    }

    private var state: State = .idle
    private var session: SpeechSession? {
        switch state {
        case .idle: nil
        case let .radio(session, _), let .once(session): session
        }
    }

    /// The sessions stopped, still being cancelled: a new one waits for
    /// them, so no old analyzer is still running beside it.
    @ObservationIgnored private var retiring: Task<Void, Never>?
    private var words: [String] = []
    private var next = 0
    private var cut: Task<Void, Never>?
    /// The system's word that another sound took the microphone (a phone
    /// call, Siri) and gave it back, while listening.
    private var interruptions: Task<Void, Never>?

    /// Whether the radio may be listened to: the ATC Copilot on in
    /// Settings' Extras, else `problem` says where it is turned on.
    private func offered() -> Bool {
        guard Extra.atcCopilot.on() else {
            problem = "The ATC Copilot is off: turn it on in Settings, under Extras."
            return false
        }
        return true
    }

    /// The microphone's audio session ready, with `problem` set where it
    /// cannot be: the permissions asked for with the system's sheets, the
    /// audio session for recording.
    private func openMicrophone() async -> Bool {
        problem = nil
        // Asked first, so a phone that cannot keep speech on itself is
        // never even asked for the permission.
        guard canListen else {
            problem = "Speech cannot be recognized on this iPhone; type the clearance instead."
            Log.radio.error("on-device speech recognition is not available")
            return false
        }
        guard await Self.allowed() else {
            problem = "Microphone or speech recognition access was refused; allow it for Wingtip Maps in Settings."
            Log.radio.error("the microphone or speech recognition was refused")
            return false
        }
        stop()
        await retiring?.value
        // The radio takes the microphone: a question being said ends.
        VoiceInput.shared.finish()
        do {
            let audio = AVAudioSession.sharedInstance()
            try audio.setCategory(.record, mode: .measurement, options: .duckOthers)
            try audio.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            problem = "No microphone could be used."
            Log.radio.error("the audio session could not be set up: \(error.localizedDescription, privacy: .public)")
            return false
        }
        return true
    }

    /// A session started, with `problem` set where it cannot be.
    /// Any session still held is stopped and its cancelling awaited first,
    /// and only the newest session's results are told, so two analyzers
    /// never feed the log at once.
    private func begin(_ kind: SpeechSession.Kind, words: [String], heard: @escaping @MainActor (SpeechSession.Heard) -> Void) async -> SpeechSession? {
        // Looped: another begin may have started while this one waited.
        while session != nil || retiring != nil {
            if session != nil { retire() }
            await retiring?.value
        }
        let session = SpeechSession(kind)
        state = kind == .radio ? .radio(session, live: false) : .once(session)
        do {
            try await session.start(words: words) { [weak self] result in
                guard self?.session === session else { return }
                heard(result)
            }
            guard self.session === session else {
                await session.cancel()
                return nil
            }
            if kind == .radio { state = .radio(session, live: true) }
            return session
        } catch {
            await session.cancel()
            if self.session === session { state = .idle }
            problem = Problems.words("The microphone would not start", error)
            Log.radio.error("the microphone would not start: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    func start(words: [String]) async {
        guard offered() else { return }
        await Notifications.allow()
        guard await openMicrophone() else { return }
        self.words = words
        // Each settled stretch is a transmission; the words still changing
        // are the next one's so far.
        guard await begin(.radio, words: words, heard: { [weak self] result in
            guard let self, !result.text.isEmpty else { return }
            let id = self.next
            self.heard(id, result.text.trimmingCharacters(in: .whitespaces), final: result.final)
            if result.final { self.next += 1 }
        }) != nil else { return }
        Log.radio.notice("listening to the radio, \(words.count) names to listen for")
        // Taken away by a phone call or Siri, the microphone is listened
        // to again once the system recommends resuming (iOS 27's
        // resumptionRecommendationNotification, in place of the
        // interruption's ended-and-shouldResume), as Apple's audio guidance
        // has a recorder do; otherwise the radio went quiet for good until
        // the pilot tapped the microphone again.
        interruptions?.cancel()
        interruptions = Task { [weak self] in
            for await note in NotificationCenter.default.notifications(named: AVAudioSession.resumptionRecommendationNotification) {
                guard let self, let context = note.userInfo?[AVAudioSession.resumptionContextKey] as? AVAudioSession.ResumptionContext,
                      context.recommendation == .shouldResume else { continue }
                let words = self.words
                await self.start(words: words)
            }
        }
    }

    private func heard(_ id: Int, _ text: String, final: Bool) {
        // Where the engine cannot say whether it was ours, the call is
        // shown as not ours and the reason said (problem).
        var forUs = false
        if let tail {
            do { forUs = try HeardCall.ourCall(text, tail: tail) } catch { problem = Problems.say("Whether that was your call sign could not be told", error) }
        }
        let was = heard.firstIndex { $0.id == id }
        let wasFinal = was.map { heard[$0].final } ?? false
        let next = Transmission(id: id, at: was.map { heard[$0].at } ?? Date(), text: text, final: final, forUs: forUs)
        if let was { heard[was] = next } else { heard = Array((heard + [next]).suffix(Self.kept)) }
        // What was said is the pilot's own: private off the device.
        if final { Log.radio.debug("heard\(forUs ? " for us" : ""): \(text, privacy: .private)") }
        if forUs && final && !wasFinal { tell(text) }
    }

    /// A call to us: a time-sensitive notification while the app is not
    /// in front, the warning's tap in the app (the call is on its screen; Feel).
    private func tell(_ text: String) {
        // VoiceOver says the call at once, as the banner shows it.
        Announce.alert("ATC called you: \(text)", urgent: true)
        if !Notifications.tell("ATC called you", text) {
            Feel.tap(.warning)
        }
    }

    /// One thing said for the radio's screens, a readback (ClearanceSheet,
    /// AtcCopilot): the microphone until the words settle -- a pause after the last of
    /// them, or `longestOnce` -- then closed again. Nothing heard goes in
    /// the radio's log, and nothing is kept. Nil with `problem` set where
    /// the microphone cannot be had, or when the radio is being listened
    /// to, which it would have to be stopped for.
    func hearOnce(words: [String] = []) async -> String? {
        guard offered() else { return nil }
        guard !listening else {
            problem = "The radio is being listened to; stop it to read back by voice."
            return nil
        }
        guard await openMicrophone() else { return nil }
        heardOnce = nil
        settledOnce = ""
        let session = await begin(.said, words: words) { [weak self] result in
            guard let self else { return }
            if result.final { self.settledOnce += result.text }
            let said = (result.final ? self.settledOnce : self.settledOnce + result.text).trimmingCharacters(in: .whitespaces)
            if !said.isEmpty { self.heardOnce = said }
            // A pause after the last words is the end of the question.
            self.endAfter(Self.pause)
        }
        if let session {
            endAfter(Self.longestOnce)
            await session.finished()
        }
        if self.session === session { stop() }
        return heardOnce
    }

    /// The session ended after `seconds` with no newer word.
    private func endAfter(_ seconds: TimeInterval) {
        cut?.cancel()
        let session = session
        cut = Task {
            try? await Task.sleep(for: .seconds(seconds))
            if !Task.isCancelled { await session?.finish() }
        }
    }

    /// One broadcast heard and no more -- an ATIS or AWOS off the
    /// field's frequency (Atis) -- as the web's lib/atis hears it: the
    /// words so far to `heard` as they come, and the whole once they
    /// stop coming for `pause` seconds, nothing has come for `nothing`
    /// seconds, or `longest` seconds have passed. Nil where the
    /// microphone or the recognizer refused (`problem` says why).
    func hearBroadcast(words: [String] = [], pause: TimeInterval = 3, nothing: TimeInterval = 15, longest: TimeInterval = 75,
                       heard: @MainActor (String) -> Void = { _ in }) async -> String? {
        let from = next
        await start(words: words)
        guard listening else { return nil }
        let began = Date()
        var last = began
        var said = ""
        defer { stop() }
        while listening {
            try? await Task.sleep(for: .milliseconds(250))
            let now = Date()
            let text = self.heard.filter { $0.id >= from }.map(\.text).joined(separator: " ")
            if text != said {
                said = text
                last = now
                heard(text)
            }
            let quiet = now.timeIntervalSince(last)
            if (said.isEmpty && quiet >= nothing) || (!said.isEmpty && quiet >= pause) || now.timeIntervalSince(began) >= longest { break }
        }
        return said
    }

    func stop() {
        cut?.cancel()
        interruptions?.cancel()
        interruptions = nil
        retire()
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// The session held let go: its microphone closed at once, its
    /// analyzer cancelled in `retiring`, after any cancelled before it.
    private func retire() {
        guard let session else { return }
        state = .idle
        session.closeMicrophone()
        let before = retiring
        let task = Task { [weak self] in
            await before?.value
            await session.cancel()
            guard let self else { return }
            // The last one to end clears the slot.
            if self.retiringID == ObjectIdentifier(session) { self.retiring = nil }
        }
        retiring = task
        retiringID = ObjectIdentifier(session)
    }

    @ObservationIgnored private var retiringID: ObjectIdentifier?

    static func allowed() async -> Bool {
        let speech = await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            SFSpeechRecognizer.requestAuthorization { done.resume(returning: $0 == .authorized) }
        }
        guard speech else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
}
