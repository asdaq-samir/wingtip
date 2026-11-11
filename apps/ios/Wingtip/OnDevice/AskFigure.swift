import Foundation

/// One figure an on-device answer rests on: the chip (a WordsSource, the
/// same id, label and raw text the planner's answers carry, so a chip
/// means one thing whoever wrote the sentence) and the figure said in one
/// plain sentence -- the engine's words, shown as they are when no model
/// is on the phone. The chip's text ends with where the figure comes
/// from: the engine's rule and its reference, or the report as sent.
struct AskFigure: Equatable, Sendable {
    let source: WordsSource
    let said: String

    init(id: String, label: String, said: String, from: String) {
        source = WordsSource(id: id, label: label, text: "\(said)\n\nSource: \(from)")
        self.said = said
    }

    var id: String { source.id }

    /// The figure as a tool hands it to the model: its id to cite, and
    /// the sentence to word.
    var forModel: String { "[\(id)] \(source.label): \(said)" }
}

/// Why a figure could not be worked out on the phone, in a pilot's words:
/// the model is told it, and the engine's own words say it.
struct AskRefused: Error, LocalizedError, Equatable {
    let why: String
    var errorDescription: String? { why }
}

/// The figures the tools worked out for one answer, in the order asked,
/// each once: what the model's sentences may cite and nothing else
/// (Words.checked). The tools run off the main actor, a call at a time
/// or several at once, so the list is behind a lock.
final class FigureLog: @unchecked Sendable {
    private let lock = NSLock()
    private var kept: [AskFigure] = []
    /// Each tool called, by name, for the tests and the log.
    private var calls: [String] = []
    private var answeredAt: ModelPlace = .device

    /// Where the model that used these figures answered (AppleModels).
    var place: ModelPlace {
        get { lock.lock(); defer { lock.unlock() }; return answeredAt }
        set { lock.lock(); answeredAt = newValue; lock.unlock() }
    }

    func add(_ figures: [AskFigure], by tool: String) {
        lock.lock()
        defer { lock.unlock() }
        calls.append(tool)
        for figure in figures where !kept.contains(where: { $0.id == figure.id }) { kept.append(figure) }
    }

    var figures: [AskFigure] {
        lock.lock()
        defer { lock.unlock() }
        return kept
    }

    var called: [String] {
        lock.lock()
        defer { lock.unlock() }
        return calls
    }

    var sources: [WordsSource] { figures.map(\.source) }
}

/// The guard against a number of the model's own: a sentence may quote
/// only numbers that are in the figures it cites. Apple's on-device model
/// is small, and asked to word "8 kt across" it can write "9"; such a
/// sentence is dropped, not shown. Numbers are compared by value, so
/// "5,500" is 5500 and runway "09" is 9.
enum NumberGuard {
    static func numbers(in text: String) -> Set<Double> {
        var out = Set<Double>()
        var digits = ""
        func close() {
            // A trailing point is a full stop, not a decimal.
            while digits.hasSuffix(".") { digits.removeLast() }
            if let value = Double(digits) { out.insert(value) }
            digits = ""
        }
        for ch in text {
            if ch.isASCII, ch.isNumber {
                digits.append(ch)
            } else if !digits.isEmpty, ch == "," {
                continue
            } else if !digits.isEmpty, ch == ".", !digits.contains(".") {
                digits.append(ch)
            } else if !digits.isEmpty {
                close()
            }
        }
        if !digits.isEmpty { close() }
        return out
    }

    /// The numbers in `text` that none of `given` holds.
    static func invented(_ text: String, given: [String]) -> Set<Double> {
        let allowed = given.reduce(into: Set<Double>()) { $0.formUnion(numbers(in: $1)) }
        return numbers(in: text).subtracting(allowed)
    }

    /// The sentences whose every number is in a figure they cite; Words.checked
    /// has already dropped those citing an id not given.
    static func kept(_ words: Words) -> Words {
        let sentences = words.sentences.filter { sentence in
            let cited = sentence.sources.compactMap(words.source).map(\.text)
            return invented(sentence.text, given: cited).isEmpty
        }
        let cited = Set(sentences.flatMap(\.sources))
        return Words(model: words.model, sentences: sentences, sources: words.sources.filter { cited.contains($0.id) }, unavailable: words.unavailable)
    }
}
