import AVFoundation
import SwiftUI

/// The Brief at a glance on this iPhone (BriefSummary), shown over the
/// Go / No-Go when the planner's words cannot be had: the verdict, at
/// most three actions, who wrote them, and Say It, which reads them
/// aloud for a pilot whose eyes are outside. The findings under it are
/// the Go / No-Go's own and untouched.
struct BriefSummarySection: View {
    let answer: GoNoGoAnswer
    var summaries = BriefSummaryFor()
    @State private var summary: BriefSummary?
    @State private var voice = BriefVoice()

    var body: some View {
        Section {
            if let summary {
                Label {
                    Text(summary.verdict).font(.headline)
                } icon: {
                    Image(systemName: FindingStyle.symbol(summary.finding))
                        .foregroundStyle(FindingStyle.colour(summary.finding))
                        .accessibilityLabel(FindingStyle.word(summary.finding))
                }
                .accessibilityElement(children: .combine)
                ForEach(summary.actions) { action in
                    Label(action.words, systemImage: "arrow.right.circle")
                }
                Button {
                    voice.toggle(summary.spoken)
                } label: {
                    Label(voice.speaking ? "Stop" : "Say It", systemImage: voice.speaking ? "stop.circle" : "speaker.wave.2")
                }
                .accessibilityHint("Reads the glance aloud")
            } else {
                ProgressView("Writing the glance…")
            }
        } header: {
            HStack {
                SectionTitle("At a Glance")
                Spacer()
                if let summary { Text(summary.origin.caption).textCase(nil).font(.footnote) }
            }
        }
        // Why the engine's glance and not the model's is in the log, not
        // a footnote (docs/decisions/0019); the caption says who wrote it.
        .task(id: answer) {
            summary = nil
            let written = await summaries.summary(answer)
            guard !Task.isCancelled else { return }
            summary = written
        }
        .onDisappear { voice.stop() }
    }
}

/// The glance said aloud with the system's voice, as the alerts ahead are
/// (SpokenAlerts); one at a time, stopped when the Brief goes.
@MainActor
@Observable
final class BriefVoice: NSObject, AVSpeechSynthesizerDelegate {
    private(set) var speaking = false
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()

    override init() {
        super.init()
        synthesizer.delegate = self
    }

    func toggle(_ words: String) {
        if speaking { stop(); return }
        speaking = true
        synthesizer.speak(AVSpeechUtterance(string: words))
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        speaking = false
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor in self.speaking = false }
    }
}
