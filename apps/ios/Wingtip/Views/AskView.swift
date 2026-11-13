import SwiftUI

/// Ask: a question about the flight answered on this iPhone
/// (AskScreenModel), in words with the engine's and the planner's own
/// figures and the raw reports it read, each a chip under the answer
/// that opens the report as sent. The conversation is bubbles, the
/// assistant's on the left, the pilot's on the right in the tint, and the
/// answer's text appends as it streams. A
/// question is typed, or said once through the microphone (Ask by voice,
/// VoiceInput), its words appearing in the field as they are said. A card
/// (SheetPage.ask), from the sparkle button on the map or the one search's
/// "Ask: …", with Plan, OwnShip and InFlight in the environment as the
/// root puts them.
struct AskView: View {
    @Environment(VoiceInput.self) private var voice
    @Environment(InFlight.self) private var inFlight
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var client = AskScreenModel()
    @State private var question = ""
    /// The chip tapped, its raw text pushed in this card.
    @State private var source: AssistantSource?
    /// Why the microphone could not be used, under the field.
    @State private var micProblem: String?
    @FocusState private var typing: Bool
    /// The question the one search sent ("Ask: …"), asked as the sheet
    /// opens; nil opened from the map's sparkle or a link.
    var first: String?

    /// What a pilot asks first, offered while there is nothing to read.
    static let suggestions = [
        "Is the weather good enough for my minimums?",
        "What's the crosswind at my destination?",
        "Brief me",
    ]

    var body: some View {
        VStack(spacing: 0) {
            conversation
            Divider()
            composer
        }
        .navigationTitle("Ask")
        // A chip's report pushed in Ask's own card, with Back.
        .navigationDestination(item: $source) { source in SourceSheet(source: source) }
        .task {
            AskRouter.prewarm()
            if let first, client.turns.isEmpty { send(first) }
        }
        // Put away, the answer stops; a report pushed over it is not
        // putting it away.
        .onDisappear { if source == nil { client.cancel() } }
    }

    private var conversation: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: WingtipSpace.md) {
                    if client.turns.isEmpty {
                        suggestionsList
                    }
                    ForEach(client.turns) { turn in
                        TurnBubble(turn: turn, onSource: { source = $0 })
                            .id(turn.id)
                    }
                }
                .padding(WingtipSpace.lg)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: client.turns.last?.content) {
                guard let last = client.turns.last else { return }
                // The answer kept in sight as it grows; a jump, not a
                // glide, with Reduce Motion on.
                if reduceMotion {
                    proxy.scrollTo(last.id, anchor: .bottom)
                } else {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
    }

    private var suggestionsList: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            Text("Ask about the flight")
                .font(.title3.weight(.semibold))
            Text("The figures are the engine's and the planner's; each answer shows what it read.")
                .font(.footnote).foregroundStyle(.secondary)
            ForEach(Self.suggestions, id: \.self) { words in
                Button { send(words) } label: {
                    HStack {
                        Text(words).multilineTextAlignment(.leading)
                        Spacer()
                        Image(systemName: "arrow.up.circle").accessibilityHidden(true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.vertical, WingtipSpace.sm)
                }
                .contentShape(Rectangle().inset(by: -6))
                .accessibilityHint("Asks the assistant")
            }
        }
        .padding(.bottom, WingtipSpace.sm)
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            HStack(alignment: .bottom, spacing: WingtipSpace.sm) {
                TextField(voice.listening ? OneSearchModel.speak : "Ask about the flight", text: $question, axis: .vertical)
                    .lineLimit(1...4)
                    .borderedField()
                    .submitLabel(.send)
                    .focused($typing)
                    .onSubmit { send(question) }
                    .accessibilityLabel("Your question")
                // Asked by voice only where speech stays on the iPhone.
                if voice.canListen {
                    // The system's mic, filled and breathing while it
                    // listens (symbolDictating); a second tap ends it.
                    Button {
                        if voice.listening { voice.finish() } else { Task { await hear() } }
                    } label: {
                        Image(systemName: voice.listening ? "mic.fill" : WingtipIcon.microphone)
                            .foregroundStyle(voice.listening ? accent : .secondary)
                            .symbolDictating(voice.listening)
                            .symbolSwap()
                            .frame(width: 28, height: 28)
                    }
                    .contentShape(Rectangle().inset(by: -8))
                    .disabled(client.answering)
                    .accessibilityLabel(voice.listening ? "Listening…" : "Ask by voice")
                }
                Button { send(question) } label: {
                    Image(systemName: "arrow.up.circle.fill")
                        .font(.title2)
                        .frame(width: 28, height: 28)
                }
                .contentShape(Rectangle().inset(by: -8))
                .disabled(question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Send")
            }
            ProblemLine(micProblem)
        }
        .padding(.horizontal, WingtipSpace.lg)
        .padding(.vertical, WingtipSpace.sm)
    }

    private func send(_ words: String) {
        let words = words.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !words.isEmpty else { return }
        question = ""
        micProblem = nil
        client.ask(words, facts: .make(plan: plan, ownShip: ownShip, inFlight: inFlight))
    }

    /// One question said: the route's idents are given the recognizer as
    /// words to listen for, so "KMSN" is not "Kay Em Ess En".
    private func hear() async {
        micProblem = nil
        typing = false
        question = ""
        if let said = await voice.hear(words: plan.idents.filter { !$0.isEmpty }, heard: { question = $0 }) {
            send(said)
        } else {
            micProblem = voice.problem ?? "Nothing was heard."
        }
    }
}

/// One turn: the pilot's words in the tint on the right, the assistant's
/// on the left with its source chips and, where the stream broke, why.
private struct TurnBubble: View {
    @Environment(\.lookAccent) private var accent
    let turn: AssistantTurn
    let onSource: (AssistantSource) -> Void

    var body: some View {
        VStack(alignment: turn.role == .user ? .trailing : .leading, spacing: WingtipSpace.sm) {
            if turn.role == .user {
                Text(turn.content)
                    .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                    .background(accent, in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .accessibilityLabel("You asked: \(turn.content)")
            } else {
                // Who wrote it: this iPhone's model, Apple's Private Cloud
                // Compute, or the engine alone.
                if let origin = turn.origin {
                    Text(origin).font(.caption).foregroundStyle(.secondary)
                }
                if !turn.content.isEmpty {
                    Text(turn.content)
                        .textSelection(.enabled)
                        .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                        .background(.fill.tertiary, in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityLabel("The assistant: \(turn.content)")
                }
                if !turn.sources.isEmpty {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: WingtipSpace.sm) {
                            ForEach(turn.sources) { source in
                                Button(source.label) { onSource(source) }
                                    .glassButton()
                                    .controlSize(.small)
                                    .contentShape(Rectangle().inset(by: -8))
                                    .accessibilityLabel("Source: \(source.label)")
                                    .accessibilityHint("Shows the report as sent")
                            }
                        }
                    }
                }
                ProblemLine(turn.problem)
            }
        }
        .frame(maxWidth: .infinity, alignment: turn.role == .user ? .trailing : .leading)
    }
}

/// The raw report a chip stands for, as sent, in a fixed-width face so a
/// METAR's groups line up as pilots read them: a page of Ask's card.
private struct SourceSheet: View {
    let source: AssistantSource

    var body: some View {
        ScrollView {
            Text(source.text)
                .font(.system(.body, design: .monospaced))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(WingtipSpace.lg)
        }
        .navigationTitle(source.label)
    }
}

#Preview("AskView") {
    NavigationStack { AskView() }
        .environment(Plan())
        .environment(OwnShip())
}
