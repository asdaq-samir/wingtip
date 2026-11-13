import SwiftUI

/// The assistant's last answer, a card over the strip: the question, the
/// answer as it streams with the reports it rests on as chips, each
/// opening the report as sent; Stop while it answers, and ✕ forgetting
/// the conversation. The answer is this iPhone's (AskScreenModel);
/// the Brief's Ask (AskView) draws the whole conversation, this the last
/// turn.
struct StripAnswerCard: View {
    let client: AskScreenModel
    let onClose: () -> Void
    @Environment(\.chartInk) private var ink
    @State private var source: AssistantSource?

    private var asked: AssistantTurn? { client.turns.last { $0.role == .user } }
    private var answer: AssistantTurn? { client.turns.last { $0.role == .assistant } }

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(spacing: WingtipSpace.sm) {
                Text("Ask").font(ChartInk.heading).frame(maxWidth: .infinity, alignment: .leading)
                if client.answering {
                    Button { client.cancel() } label: { Label("Stop", systemImage: "stop.fill") }
                        .font(ChartInk.detail).buttonStyle(.plain).foregroundStyle(ink.tint)
                        .contentShape(Rectangle().inset(by: -8))
                }
                Button(action: onClose) {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(ink.muted)
                        .contentShape(Rectangle().inset(by: -10))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Dismiss the answer")
            }
            if let asked {
                Text(asked.content).font(ChartInk.detail).foregroundStyle(ink.muted)
                    .accessibilityLabel("You asked: \(asked.content)")
            }
            if let answer, !answer.content.isEmpty {
                Text(answer.content).font(ChartInk.text).textSelection(.enabled)
                    .accessibilityLabel("The assistant: \(answer.content)")
            }
            if let answer, !answer.sources.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: WingtipSpace.sm) {
                        ForEach(answer.sources) { s in
                            Button(s.label) { source = s }
                                .accessibilityLabel("Source: \(s.label)")
                                .accessibilityHint("Shows the report as sent")
                                // 44 points to tap round the small button.
                                .contentShape(.interaction, Rectangle().inset(by: -WingtipSpace.sm))
                        }
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .controlSize(.small)
                    .padding(.vertical, WingtipSpace.sm)
                }
            }
            ProblemLine(answer?.problem)
        }
        .padding(WingtipSpace.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .inkCard()
        .sheet(item: $source) { source in StripSourceSheet(source: source) }
        .accessibilityIdentifier("strip-answer")
    }
}

/// The raw report a chip stands for, as sent, in a fixed-width face so a
/// METAR's groups line up as pilots read them.
struct StripSourceSheet: View {
    let source: AssistantSource
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                Text(source.text)
                    .font(.system(.body, design: .monospaced))
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(WingtipSpace.lg)
            }
            .navigationTitle(source.label)
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { dismiss() }
        }
        .presentationDetents([.medium, .large])
    }
}
