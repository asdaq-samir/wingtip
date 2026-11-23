import Foundation
import Testing
@testable import Wingtip

/// The documents library's addresses, finding and the CFR text's search
/// (Library/DocPlace, ReaderFinding), the web's docPlace, pdfPlaces and
/// textSearch tests over the same cases.
struct DocPlaceTests {
    @Test func readsADocumentAndItsPlace() {
        #expect(DocPlace("aim@7-1-5") == DocPlace(doc: "aim", at: "7-1-5"))
        #expect(DocPlace("cfr-14-91@91.155") == DocPlace(doc: "cfr-14-91", at: "91.155"))
        #expect(DocPlace("phak@p42") == DocPlace(doc: "phak", page: 42))
        #expect(DocPlace("phak@p0")?.page == 1)
        #expect(DocPlace("own:1F2E-AB")?.isOwn == true)
        #expect(DocPlace("own:1F2E-AB")?.ownID == "1F2E-AB")
        #expect(DocPlace("aim") == DocPlace(doc: "aim"))
    }

    @Test func refusesWhatIsNoDocumentsName() {
        #expect(DocPlace("../etc/passwd") == nil)
        #expect(DocPlace("") == nil)
        #expect(DocPlace("a/b") == nil)
        // A place it cannot read leaves the document, opened at its start.
        #expect(DocPlace("aim@<script>") == DocPlace(doc: "aim"))
    }

    @Test func writesItBackAsALinkDoes() {
        for text in ["aim@7-1-5", "phak@p42", "cfr-14-91@91.155", "own:x1", "afh"] {
            #expect(DocPlace(text)?.text == text)
        }
    }

    @Test func linksOpenItOnAnyDeviceButTheOwnStayHere() throws {
        let link = try #require(DocPlace(doc: "aim", at: "7-1-5").link(host: URL(string: "https://wingtipmaps.app")!))
        #expect(link.absoluteString == "https://wingtipmaps.app/app/plan?doc=aim@7-1-5")
        #expect(DocPlace.of(link: link) == DocPlace(doc: "aim", at: "7-1-5"))
        #expect(DocPlace.own("x").link() == nil)
        let app = try #require(DocPlace(doc: "cfr-14-91", at: "91.155").appLink)
        #expect(DocPlace.of(link: app) == DocPlace(doc: "cfr-14-91", at: "91.155"))
        #expect(Links.command(for: app) == .document(DocPlace(doc: "cfr-14-91", at: "91.155")))
    }

    @Test func aCiteLinksOnlyWhereTheShelfHoldsItsDocument() {
        let shelf = [LibraryEntry(edition: "2026-11-10", group: "Regulations", id: "cfr-14-91", kind: "text", title: "14 CFR Part 91"),
                     LibraryEntry(group: "Regulations", id: "cfr-14-135", kind: "text", title: "14 CFR Part 135")]
        #expect(DocPlace.cited(doc: "cfr-14-91", at: "91.155", shelf: shelf) == DocPlace(doc: "cfr-14-91", at: "91.155"))
        // On the shelf but never had: words.
        #expect(DocPlace.cited(doc: "cfr-14-135", at: nil, shelf: shelf) == nil)
        #expect(DocPlace.cited(doc: "aim", at: "7-1-5", shelf: shelf) == nil)
    }
}

struct ReaderFindingTests {
    @Test func findsAParagraphsRowNotALongerNumber() {
        let titles = ["Chapter 7. Safety of Flight", "7-1-50. Something Else", "7–1–5. Preflight Briefings", "Section 91.155 Basic VFR"]
        #expect(ReaderFinding.row(for: "7-1-5", in: titles) == 2)
        #expect(ReaderFinding.row(for: "91.155", in: titles) == 3)
        #expect(ReaderFinding.row(for: "7-1-6", in: titles) == nil)
    }

    @Test func plainsTheDashesAPDFSetsANumberIn() {
        #expect(ReaderFinding.plainDashes("7\u{2013}1\u{2212}5") == "7-1-5")
        #expect(ReaderFinding.headingWords("7-1-5") == "7-1-5.")
    }

    private let part = CfrText(groups: [
        APICfrGroup(head: "Subpart B -- Flight Rules", sections: [
            APICfrSection(head: "§ 91.155 Basic VFR weather minimums.", id: "91.155",
                          paragraphs: ["(a) Except as provided in paragraph (b) of this section, no person may operate an aircraft under VFR."]),
            APICfrSection(head: "§ 91.157 Special VFR weather minimums.", id: "91.157", paragraphs: ["(a) Special VFR operations may be conducted."]),
        ]),
    ], head: "Part 91 -- General Operating and Flight Rules")

    @Test func searchesAPartsTextInItsOrder() {
        let hits = ReaderFinding.search(part, "vfr")
        #expect(hits.map(\.section) == ["91.155", "91.155", "91.157", "91.157"])
        #expect(hits[0].paragraph == -1)
        #expect(hits[1].match == "VFR")
        #expect(hits[1].after == ".")
        #expect(ReaderFinding.search(part, "v").isEmpty)
    }

    @Test func findsTheSectionACiteNames() {
        #expect(ReaderFinding.section(part, at: "91.157") == "91.157")
        #expect(ReaderFinding.section(part, at: "91.999") == nil)
    }

    /// A find's match is taken only where it is the words looked for, so a
    /// match a cancelled find had queued ("ILS") is not highlighted for
    /// the next ("ILS RWY").
    @Test(arguments: [
        ("ILS RWY", "ils rwy", true),
        ("ILS\nRWY", "ILS RWY", true),
        ("ILS", "ILS RWY", false),
        (nil, "ILS", false),
    ] as [(String?, String, Bool)])
    func aMatchIsTheWordsLookedFor(_ text: String?, _ words: String, _ same: Bool) {
        #expect(PDFReaderController.same(text, words) == same)
    }
}

/// The engine's citations, as CitedText asks it, held to the shared cases
/// the engine's own tests and the web's read (apps/web/src/lib/fixtures).
struct CitationsFixtureTests {
    private final class Bundled {}

    struct Case: Decodable {
        struct Piece: Decodable {
            struct Cite: Decodable { let kind: String; let doc: String; let at: String?; let paragraph: String? }
            let text: String
            let cite: Cite?
        }

        let about: String
        let text: String
        let want: [Piece]
    }

    struct Cases: Decodable { let cases: [Case] }

    @Test func everyCaseCutsAsTheEngineSays() throws {
        let url = try #require(Bundle(for: Bundled.self).url(forResource: "citations", withExtension: "json"))
        let cases = try JSONDecoder().decode(Cases.self, from: Data(contentsOf: url)).cases
        #expect(!cases.isEmpty)
        for c in cases {
            let pieces = try Engine.citations(text: c.text).pieces
            #expect(pieces.map(\.text) == c.want.map(\.text), "\(c.about)")
            #expect(pieces.map { $0.cite?.doc } == c.want.map { $0.cite?.doc }, "\(c.about)")
            #expect(pieces.map { $0.cite?.at } == c.want.map { $0.cite?.at }, "\(c.about)")
            #expect(pieces.map { $0.cite?.paragraph } == c.want.map { $0.cite?.paragraph }, "\(c.about)")
        }
    }

    @MainActor
    @Test func aCitedTextLinksTheShelfsDocumentsAlone() {
        let shelf = [LibraryEntry(edition: "2026-11-10", group: "Regulations", id: "cfr-14-91", kind: "text", title: "14 CFR Part 91")]
        let linked = CitedText.linked("14 CFR 91.155; AIM 7-1-5", shelf: shelf)
        let links = linked.runs.compactMap(\.link)
        #expect(links.count == 1)
        #expect(links.first.flatMap(DocPlace.of(link:)) == DocPlace(doc: "cfr-14-91", at: "91.155"))
        #expect(String(linked.characters) == "14 CFR 91.155; AIM 7-1-5")
        // No shelf yet: the words as they are.
        #expect(CitedText.linked("14 CFR 91.155", shelf: []).runs.allSatisfy { $0.link == nil })
    }
}
