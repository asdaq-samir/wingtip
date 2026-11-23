import Foundation
import PDFKit

/// How the reader finds its way, apart from PDFKit and the screens so it
/// is tested on its own, as the web's pdfPlaces and textSearch are: the
/// outline flattened into rows, a cited paragraph found among them, and a
/// CFR part's text searched.
enum ReaderFinding {
    /// An outline row, its depth for its indent; `item` is PDFKit's own,
    /// none in a test.
    struct OutlineRow: Identifiable {
        let id: Int
        let title: String
        let depth: Int
        let item: PDFOutline?
    }

    /// PDFKit's outline as rows, in its order, each under the one it is in.
    static func rows(_ root: PDFOutline?) -> [OutlineRow] {
        var out: [OutlineRow] = []
        func walk(_ node: PDFOutline, depth: Int) {
            for i in 0..<node.numberOfChildren {
                guard let child = node.child(at: i) else { continue }
                out.append(OutlineRow(id: out.count, title: child.label ?? "", depth: depth, item: child))
                walk(child, depth: depth + 1)
            }
        }
        if let root { walk(root, depth: 0) }
        return out
    }

    /// The dashes a PDF's text may set a paragraph's number in (the AIM's
    /// "7–1–5", a minus) as the hyphen the engine's citations write.
    static func plainDashes(_ text: String) -> String {
        String(text.map { "\u{2010}\u{2011}\u{2012}\u{2013}\u{2014}\u{2015}\u{2212}".contains($0) ? "-" : $0 })
    }

    /// The row for a paragraph or section ("7-1-5", "91.155"): the first
    /// whose title starts with it, a word after it ("7-1-5. Preflight
    /// Briefings"), not a longer number ("7-1-50").
    static func row(for at: String, in titles: [String]) -> Int? {
        let wanted = plainDashes(at)
        return titles.firstIndex { raw in
            var title = plainDashes(raw.trimmingCharacters(in: .whitespaces))
            for lead in ["Paragraph ", "paragraph ", "Section ", "section ", "§ ", "§"] where title.hasPrefix(lead) {
                title = String(title.dropFirst(lead.count))
                break
            }
            guard title.hasPrefix(wanted) else { return false }
            let next = title.dropFirst(wanted.count).first
            return next.map { !$0.isNumber } ?? true
        }
    }

    /// What the reader searches the text for where the outline has no row
    /// for a paragraph: its number as a heading sets it, with its stop.
    static func headingWords(_ at: String) -> String { "\(at)." }

    // MARK: A CFR part's text

    /// A place a search found in a CFR part: its section, the paragraph
    /// (-1 its heading), and the words round the match.
    struct TextHit: Hashable, Identifiable {
        let section: String
        let paragraph: Int
        let before: String
        let match: String
        let after: String
        var id: String { "\(section)#\(paragraph)#\(before.count)#\(before)" }
    }

    /// Words either side of a match in its result's row.
    static let around = 40
    /// The most results listed: past that the pilot types more.
    static let mostHits = 200

    /// Every place `query` is found in the part, in its order, its case
    /// aside; a section's number and heading count as its text.
    static func search(_ text: CfrText?, _ query: String) -> [TextHit] {
        let wanted = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard let text, wanted.count >= 2 else { return [] }
        var hits: [TextHit] = []
        for group in text.groups {
            for section in group.sections {
                let lines = [section.head] + section.paragraphs
                for (i, line) in lines.enumerated() {
                    let lower = line.lowercased()
                    // Lowercasing keeps a Latin line's length, so its
                    // offsets stand in the line as it is written.
                    guard lower.count == line.count else { continue }
                    var from = lower.startIndex
                    while hits.count < mostHits, let range = lower.range(of: wanted, range: from..<lower.endIndex) {
                        let start = lower.distance(from: lower.startIndex, to: range.lowerBound)
                        let end = start + wanted.count
                        let chars = Array(line)
                        let lead = max(0, start - around)
                        let tail = min(chars.count, end + around)
                        hits.append(TextHit(section: section.id, paragraph: i - 1,
                                            before: (lead > 0 ? "…" : "") + String(chars[lead..<start]),
                                            match: String(chars[start..<end]),
                                            after: String(chars[end..<tail]) + (tail < chars.count ? "…" : "")))
                        from = range.upperBound
                    }
                    if hits.count >= mostHits { return hits }
                }
            }
        }
        return hits
    }

    /// The section `at` names ("91.155"), where the part has it.
    static func section(_ text: CfrText?, at: String?) -> String? {
        guard let text, let at else { return nil }
        return text.groups.lazy.flatMap(\.sections).first { $0.id == at }?.id
    }
}
