import Foundation

/// A document open in the reader, as a link's `doc` key writes it, the
/// web's docPlace (features/documents): the library's document by the name
/// the engine's `citations` gives it ("cfr-14-91", "aim", "phak") or a
/// pilot's own PDF ("own:<id>"), and after an @ where in it, a CFR section
/// or an AIM paragraph ("91.155", "7-1-5") or a page ("p12"). So a cite
/// tapped, a bookmark, a shared link and a document's own window are one
/// address on every app (decision 0056).
struct DocPlace: Hashable, Codable, Sendable, Identifiable {
    let doc: String
    /// A section or a paragraph, opened at its heading.
    var at: String?
    /// A page, from 1.
    var page: Int?

    var id: String { text }

    init(doc: String, at: String? = nil, page: Int? = nil) {
        self.doc = doc
        self.at = at
        self.page = page
    }

    /// The `doc` key's value read; anything that is not a document's name
    /// none, so a link can never name a path.
    init?(_ value: String) {
        let parts = value.split(separator: "@", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
        let name = parts[0]
        guard name.wholeMatch(of: /(own:)?[A-Za-z0-9][A-Za-z0-9.-]{0,63}/) != nil else { return nil }
        self.init(doc: name)
        guard parts.count == 2 else { return }
        let where_ = parts[1]
        if let page = where_.wholeMatch(of: /p(\d{1,5})/) {
            self.page = max(1, Int(page.1) ?? 1)
        } else if where_.wholeMatch(of: /[A-Za-z0-9.()-]{1,32}/) != nil {
            at = where_
        }
    }

    /// As the `doc` key writes it: "aim@7-1-5", "phak@p42", "own:<id>".
    var text: String {
        if let page { return "\(doc)@p\(page)" }
        if let at { return "\(doc)@\(at)" }
        return doc
    }

    /// A pilot's own document, on this device (or their iCloud) alone.
    var isOwn: Bool { doc.hasPrefix(Self.ownPrefix) }

    /// The own document's id, without its "own:".
    var ownID: String? { isOwn ? String(doc.dropFirst(Self.ownPrefix.count)) : nil }

    static let ownPrefix = "own:"

    static func own(_ id: String) -> DocPlace { DocPlace(doc: ownPrefix + id) }

    /// The link that opens this place on any device: the web app's address
    /// with its `doc`, which the phones take as a universal link. None for
    /// a pilot's own, which no other device has.
    func link(host: URL = Config.gateway) -> URL? {
        guard !isOwn, var parts = URLComponents(url: host, resolvingAgainstBaseURL: false) else { return nil }
        parts.path = Screen.linkPath
        parts.queryItems = [URLQueryItem(name: LinkKey.doc.rawValue, value: text)]
        return parts.url
    }

    /// The same place as the app's own link, for a cite drawn as a link in
    /// a Text (CitedText), handled in the app and never by the system.
    var appLink: URL? {
        var parts = URLComponents()
        parts.scheme = Screen.scheme
        parts.host = Screen.schemeHost
        parts.queryItems = [URLQueryItem(name: LinkKey.doc.rawValue, value: text)]
        return parts.url
    }

    /// The place a link names (`?doc=`), the web's address or the app's.
    static func of(link url: URL) -> DocPlace? {
        Links.query(of: url)?[LinkKey.doc.rawValue].flatMap(DocPlace.init)
    }

    /// Where a cite opens the library, where the shelf holds its document
    /// in an edition; none where it does not, so the words stay words.
    static func cited(doc: String, at: String?, shelf: [LibraryEntry]) -> DocPlace? {
        shelf.contains { $0.id == doc && $0.edition != nil } ? DocPlace(doc: doc, at: at) : nil
    }
}
