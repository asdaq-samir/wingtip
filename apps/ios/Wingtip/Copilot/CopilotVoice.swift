import AVFoundation
import Foundation

/// The copilot's voice: Apple's speech synthesizer on the phone, over
/// whatever else plays, which ducks for it, as the alerts ahead are said
/// (SpokenAlerts). A warning cuts in on what is being said; anything
/// else waits its turn (the web's copilotVoice interrupt and say).
@MainActor
final class CopilotVoice {
    private let synthesizer = AVSpeechSynthesizer()

    func say(_ words: String, interrupt: Bool) {
        guard !words.isEmpty else { return }
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        if interrupt, synthesizer.isSpeaking { synthesizer.stopSpeaking(at: .word) }
        let utterance = AVSpeechUtterance(string: words)
        utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
        synthesizer.speak(utterance)
    }
}
