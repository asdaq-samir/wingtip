import Testing
@testable import Wingtip

/// Ask by voice (VoiceInput) and the radio (ClearanceListener) are two
/// features with two looks (the owner, 2026-11-10): their own marks, their
/// own state, and the mic's tap never touching the radio's.
@MainActor
struct VoiceInputTests {
    @Test func theMicAndTheRadioHaveTheirOwnMarks() {
        #expect(WingtipIcon.microphone == "mic")
        #expect(WingtipIcon.radio == "antenna.radiowaves.left.and.right")
        #expect(WingtipIcon.microphone != WingtipIcon.radio)
    }

    @Test func askByVoiceKeepsItsOwnState() {
        let voice = VoiceInput.shared
        let radio = ClearanceListener.shared
        #expect(!voice.listening)
        // The mic tapped again with nothing to end: the radio untouched.
        voice.finish()
        #expect(!voice.listening)
        #expect(!radio.listening)
        #expect(!radio.hearingOnce)
    }

    @Test func theSearchAsksToSpeakWhileItListens() {
        #expect(OneSearchModel.speak == "Speak your question")
        #expect(OneSearchModel.prompt != OneSearchModel.speak)
    }
}
