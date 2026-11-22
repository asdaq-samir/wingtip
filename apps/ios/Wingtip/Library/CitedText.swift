import SwiftUI

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
    @Environment(DocumentLibrary.self) private var library

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
