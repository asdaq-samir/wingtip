import AVFoundation
import Foundation
import Speech

/// The microphone heard by Apple's SpeechAnalyzer (iOS 26), on the iPhone
/// only: its transcribers run on the device's own model, never a server,
/// so nothing a pilot or the radio says leaves the phone (the owner,
/// 2026-11-09). Where English cannot be transcribed here -- an older
/// phone, the language not supported -- `canListen` is false, every
/// microphone control hides itself, and there is no voice at all; nothing
/// falls back to a server. The model is fetched once by the system's
/// AssetInventory the first time it is wanted.
///
/// One session is one listening: the microphone's buffers converted to
/// the analyzer's best format and fed in as they come, the names to
/// listen for given as its context (a fix said as a word, "Pykla", is not
/// English), each result told as it comes -- volatile while the words may
/// still change, final once settled -- until `finish` settles the rest or
/// `cancel` drops it. It replaced SFSpeechRecognizer's request and task,
/// with the hand-built Once continuation and Feed (the stock audit,
/// 2026-11-21).
@MainActor
final class SpeechSession {
    /// What is listened to: one thing said to the app (a question, a
    /// readback), or the radio, transmission after transmission.
    enum Kind { case said, radio }

    /// A result: the words of a stretch of audio, and whether they are settled.
    struct Heard: Sendable { let text: String; let final: Bool }

    struct Refused: LocalizedError {
        let errorDescription: String?
    }

    static let locale = Locale(identifier: "en-US")

    /// Whether voice is offered: English transcribed on this iPhone.
    /// SpeechTranscriber.isAvailable until `check` has asked whether the
    /// language is one the device's model takes.
    private(set) static var canListen = SpeechTranscriber.isAvailable

    /// Asked once at launch (and again whenever wanted): whether the
    /// device transcribes, and English among its languages.
    static func check() async {
        let english = await SpeechTranscriber.supportedLocale(equivalentTo: locale)
        canListen = SpeechTranscriber.isAvailable && english != nil
    }

    private let module: any SpeechModule
    private let results: AsyncThrowingStream<Heard, any Error>
    private let analyzer: SpeechAnalyzer
    private let audio = AVAudioEngine()
    private let feed = AudioFeed()
    private var reading: Task<Void, Never>?

    init(_ kind: Kind) {
        switch kind {
        case .said:
            // A question or a readback: dictation's short preset, its
            // punctuation and its words as they come.
            let dictation = DictationTranscriber(locale: Self.locale, preset: .progressiveShortDictation)
            module = dictation
            results = Self.heard(dictation.results) { Heard(text: String($0.text.characters), final: $0.isFinal) }
        case .radio:
            // The radio, without end: the transcriber's progressive
            // preset, each stretch settled a transmission at a time.
            let transcriber = SpeechTranscriber(locale: Self.locale, preset: .progressiveTranscription)
            module = transcriber
            results = Self.heard(transcriber.results) { Heard(text: String($0.text.characters), final: $0.isFinal) }
        }
        analyzer = SpeechAnalyzer(modules: [module])
    }

    /// The model installed where it is not yet, the microphone opened and
    /// the analyzer started; `heard` told each result on the main actor.
    /// Thrown in a pilot's words where any of it cannot be had.
    func start(words: [String], heard: @escaping @MainActor (Heard) -> Void) async throws {
        guard Self.canListen else { throw Refused(errorDescription: "Speech cannot be recognized on this iPhone.") }
        do {
            if let install = try await AssetInventory.assetInstallationRequest(supporting: [module]) {
                try await install.downloadAndInstall()
            }
        } catch {
            throw Refused(errorDescription: "The iPhone's speech model could not be fetched: \(error.localizedDescription)")
        }
        let input = audio.inputNode
        let natural = input.outputFormat(forBus: 0)
        guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [module], considering: natural) else {
            throw Refused(errorDescription: "Speech recognition is not available now.")
        }
        if !words.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = words
            try await analyzer.setContext(context)
        }
        let (inputs, builder) = AsyncStream<AnalyzerInput>.makeStream()
        feed.open(builder, from: natural, to: format)
        try await analyzer.start(inputSequence: inputs)
        let results = results
        reading = Task {
            do {
                for try await result in results { heard(result) }
            } catch {
                Log.radio.error("speech analysis ended: \(error.localizedDescription, privacy: .public)")
            }
        }
        try Self.tap(input, into: feed)
        audio.prepare()
        try audio.start()
    }

    /// Until the analyzer has told its last result.
    func finished() async {
        await reading?.value
    }

    /// No more audio: what was heard so far settled and told, then done.
    func finish() async {
        closeMicrophone()
        try? await analyzer.finalizeAndFinishThroughEndOfInput()
        await reading?.value
    }

    /// Dropped: nothing more is told.
    func cancel() async {
        closeMicrophone()
        reading?.cancel()
        await analyzer.cancelAndFinishNow()
    }

    /// The microphone closed at once, before the analyzer is told.
    func closeMicrophone() {
        if audio.isRunning { audio.stop() }
        audio.inputNode.removeTap(onBus: 0)
        feed.close()
    }

    /// A module's results as the app's Heard.
    private static func heard<S: AsyncSequence & Sendable>(_ sequence: S, _ read: @escaping @Sendable (S.Element) -> Heard)
        -> AsyncThrowingStream<Heard, any Error> where S.Element: Sendable {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    for try await element in sequence { continuation.yield(read(element)) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// The microphone's tap, made off the main actor: its block runs on
    /// the audio thread. iOS 27's throwing installTap; the 27.2 SDK
    /// imports its NSError out-parameter as `error: ()` under the
    /// refined name, so it is called by that name.
    private nonisolated static func tap(_ input: AVAudioInputNode, into feed: AudioFeed) throws {
        try input.__installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0), error: ()) { buffer, _ in feed.append(buffer) }
    }
}

/// The microphone's buffers, from the audio thread, converted to the
/// analyzer's format (AVAudioConverter) and given to its input stream.
final class AudioFeed: @unchecked Sendable {
    private let lock = NSLock()
    private var builder: AsyncStream<AnalyzerInput>.Continuation?
    private var converter: AVAudioConverter?
    private var format: AVAudioFormat?

    func open(_ builder: AsyncStream<AnalyzerInput>.Continuation, from natural: AVAudioFormat, to format: AVAudioFormat) {
        lock.lock(); defer { lock.unlock() }
        self.builder = builder
        self.format = format
        converter = natural == format ? nil : AVAudioConverter(from: natural, to: format)
    }

    func close() {
        lock.lock(); defer { lock.unlock() }
        builder?.finish()
        builder = nil
        converter = nil
    }

    func append(_ buffer: AVAudioPCMBuffer) {
        lock.lock(); defer { lock.unlock() }
        guard let builder else { return }
        guard let converter, let format else {
            builder.yield(AnalyzerInput(buffer: buffer))
            return
        }
        let frames = AVAudioFrameCount((Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate).rounded(.up))
        guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: max(frames, 1)) else { return }
        let given = Given()
        var problem: NSError?
        _ = converter.convert(to: out, error: &problem) { _, status in
            // The one buffer, then nothing more for now.
            if given.done {
                status.pointee = .noDataNow
                return nil
            }
            given.done = true
            status.pointee = .haveData
            return buffer
        }
        if problem == nil, out.frameLength > 0 { builder.yield(AnalyzerInput(buffer: out)) }
    }
}

/// Whether the converter has had the one buffer it is given.
private final class Given: @unchecked Sendable {
    var done = false
}
