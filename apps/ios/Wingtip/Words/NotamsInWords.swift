import SwiftUI

/// The route's NOTAMs in plain words, written on the phone: Apple's
/// on-device model over the NOTAMs the engine ranked first (notams_ranked),
/// each as sent with the engine's reasons for its rank, and the route.
/// Each sentence cites the NOTAM it rests on and quotes no figure the
/// NOTAM or its reasons do not (Words.checked, NumberGuard); the NOTAMs
/// themselves stay under it as sent. Nothing leaves the phone, and there
/// is no server path: NOTAMs are public, but the owner's rule is on-device
/// first (2026-11-09), and where the model cannot run the ranked list,
/// with its reasons, is the answer.
enum NotamsInWords {
    /// At most this many NOTAMs are given to the model: its context is small.
    static let most = 6

    /// The figures the model may cite: each top NOTAM as sent, with the
    /// engine's reasons, then the route.
    static func figures(_ ranked: [APIRankedNotam], flight: WordsSource?) -> [WordsSource] {
        var figures: [WordsSource] = ranked.sorted { $0.rank < $1.rank }.prefix(most).map { figure(id: $0.id, raw: $0.raw, reasons: $0.reasons.map(\.words)) }
        if let flight { figures.append(flight) }
        return figures
    }

    /// One NOTAM as the model reads it: as sent, then the engine's reasons.
    static func figure(id: String, raw: String, reasons: [String]) -> WordsSource {
        let why = reasons.joined(separator: "; ")
        return WordsSource(id: "notam:\(id)", label: "NOTAM \(id)", text: why.isEmpty ? raw : "\(raw)\nWhy it matters: \(why).")
    }

    static func said(_ figures: [WordsSource], device: any WordsProvider = OnDeviceWords()) async -> SaidWords {
        guard figures.contains(where: { $0.id.hasPrefix("notam:") }) else {
            return SaidWords(words: .none(OnDeviceWords.model, "No NOTAMs to say."), origin: .none)
        }
        do {
            let words = try await device.words(WordsAsk(kind: .notams, figures: figures))
            return SaidWords(words: words, origin: .apple(words))
        } catch {
            let why = (error as? WordsUnavailable)?.why ?? "Apple's on-device model could not write them."
            return SaidWords(words: .none(OnDeviceWords.model, why), origin: .none)
        }
    }
}

/// "The NOTAMs in words" under the Brief's NOTAMs, where the phone wrote
/// some; nothing where it could not (the list above says it all).
struct NotamWordsSection: View {
    let ranked: [APIRankedNotam]
    let flight: WordsSource?
    @State private var said: SaidWords?
    @State private var writing = false

    var body: some View {
        Group {
            if writing || !(said?.words.sentences.isEmpty ?? true) {
                WordsSection(title: "The NOTAMs in words", said: said, writing: writing)
            }
        }
        .task(id: ranked.map(\.id)) {
            writing = true
            defer { writing = false }
            let words = await NotamsInWords.said(NotamsInWords.figures(ranked, flight: flight))
            guard !Task.isCancelled else { return }
            said = words
        }
    }
}
