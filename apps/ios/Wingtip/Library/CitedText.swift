import SwiftUI

/// The library CitedText and CiteActions read the shelf from, the one app-wide.
@MainActor private var citedLibrary: DocumentLibrary { .shared }

/// Words as the app shows them, each cited rule among them a link that
/// opens the documents library at its paragraph: "14 CFR 91.155" at
/// § 91.155 of Part 91, "AIM 7-1-5" at its paragraph. Where each rule
/// lives is the engine's to say (its `citations`, decision 0056), and a
/// link is drawn only where the shelf holds the document; elsewhere, and
/// until the shelf is in, the words as they are. The web's Cited.
///
/// A Text with links (the system's own, in the tint, with VoiceOver's
/// Links rotor), each the app's own `doc=` link, which this view's
/// openURL takes into the reader rather than the system.
struct CitedText: View {
    let text: String
    @Environment(Navigator.self) private var nav
    private var library: DocumentLibrary { citedLibrary }

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(Self.linked(text, shelf: library.shelf))
            .environment(\.openURL, OpenURLAction { url in
                guard let place = DocPlace.of(link: url) else { return .systemAction }
                nav.reading = place
                return .handled
            })
            .task { await library.refreshShelf() }
    }

    /// The text with each cite the shelf holds as a link to its place.
    static func linked(_ text: String, shelf: [LibraryEntry]) -> AttributedString {
        guard !shelf.isEmpty, let pieces = try? Engine.citations(text: text).pieces else { return AttributedString(text) }
        var out = AttributedString()
        for piece in pieces {
            var part = AttributedString(piece.text)
            if let cite = piece.cite, let place = DocPlace.cited(doc: cite.doc, at: cite.at, shelf: shelf) {
                part.link = place.appLink
            }
            out += part
        }
        return out
    }
}

/// Each cited rule in a row VoiceOver reads as one element (a row that
/// combines its children: an airspace band's entry rules, a risk factor's
/// why) as one of the row's actions, "Open 14 CFR 91.155": a link inside a
/// combined element is read but cannot be followed, so the row keeps its
/// one spoken label and the Actions rotor opens each cite at its paragraph
/// (items 103 and 104 of the round-3 queue; the web's links are reached by
/// Tab). Only cites the shelf holds, as CitedText links them.
private struct CiteActions: ViewModifier {
    let texts: [String]
    @Environment(Navigator.self) private var nav
    private var library: DocumentLibrary { citedLibrary }

    func body(content: Content) -> some View {
        content.accessibilityActions {
            ForEach(Array(CitedText.cites(texts, shelf: library.shelf).enumerated()), id: \.offset) { _, cite in
                Button("Open \(cite.words)") { nav.reading = cite.place }
            }
        }
    }
}

extension CitedText {
    /// The cites in `texts` the shelf holds, each once: its words as
    /// written and the place it opens.
    static func cites(_ texts: [String], shelf: [LibraryEntry]) -> [(words: String, place: DocPlace)] {
        guard !shelf.isEmpty else { return [] }
        var seen = Set<String>()
        var out: [(words: String, place: DocPlace)] = []
        for text in texts {
            guard let pieces = try? Engine.citations(text: text).pieces else { continue }
            for piece in pieces {
                guard let cite = piece.cite, let place = DocPlace.cited(doc: cite.doc, at: cite.at, shelf: shelf),
                      seen.insert(place.text).inserted else { continue }
                out.append((piece.text, place))
            }
        }
        return out
    }
}

extension View {
    /// The cites in `texts` as the row's VoiceOver actions (CiteActions).
    func citeActions(_ texts: [String]) -> some View { modifier(CiteActions(texts: texts)) }
}
