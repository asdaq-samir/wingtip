import Foundation
import Testing
@testable import Wingtip

/// Every form in the shared table (apps/web/src/lib/fixtures/formats.json,
/// generated from design/tokens.json) written by Format exactly as the
/// table writes it, so the iPhone writes a figure as the web does: the UI
/// audit of 2026-11-09 (item 3) found three ways of writing one altitude.
/// A form the table gains and Format does not know fails here.
@Suite struct FormatTests {
    private final class Here {}

    /// The table: each form's examples, an input and what is written.
    private static func table() throws -> [String: [(input: Any, written: String)]] {
        let url = try #require(Bundle(for: Here.self).url(forResource: "formats", withExtension: "json"))
        let json = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url), options: [.fragmentsAllowed]) as? [String: Any])
        var out: [String: [(input: Any, written: String)]] = [:]
        for (form, body) in json where !form.hasPrefix("$") {
            let examples = (body as? [String: Any])?["examples"] as? [[String: Any]] ?? []
            out[form] = examples.compactMap { e in (e["written"] as? String).map { (input: e["input"] ?? NSNull(), written: $0) } }
        }
        return out
    }

    private static func number(_ input: Any) -> Double? { (input as? NSNumber)?.doubleValue }

    /// Format's writing of one example of a form; nil for a form it does
    /// not know.
    private static func write(_ form: String, _ input: Any) -> String? {
        switch form {
        case "cruiseAltitude": return Format.cruiseAltitude(number(input))
        case "mapLevel": return number(input).map(Format.mapLevel)
        case "altitude": return Format.altitude(number(input))
        case "altitudeRange":
            guard let pair = input as? [NSNumber], pair.count == 2 else { return nil }
            return Format.altitudeRange(pair[0].doubleValue, pair[1].doubleValue)
        case "duration": return number(input).map(Format.duration)
        case "navLogTime": return number(input).map(Format.navLogTime)
        case "zulu": return (input as? String).flatMap { ISO8601DateFormatter().date(from: $0) }.map(Format.zulu)
        case "heading": return number(input).map(Format.heading)
        case "distance": return Format.distance(number(input))
        case "speed": return Format.speed(number(input))
        case "fuel": return Format.fuel(number(input))
        case "weight": return number(input).map(Format.weight)
        case "windCorrection": return number(input).map(Format.windCorrection)
        case "variation": return number(input).map(Format.variation)
        default: return nil
        }
    }

    @Test func everyFormInTheSharedTableIsWrittenAsTheTableWritesIt() throws {
        let table = try Self.table()
        #expect(table.count >= 14, "the table has every form")
        for (form, examples) in table {
            #expect(!examples.isEmpty, "\(form) has examples")
            for example in examples {
                let written = Self.write(form, example.input)
                #expect(written != nil, "Format writes the form \(form)")
                #expect(written == example.written, "\(form) of \(example.input)")
            }
        }
    }

    /// The forms the audit found written other ways on the iPhone.
    @Test func theAuditsFiguresAreTheTablesForms() {
        #expect(Format.cruiseAltitude(2500) == "FL-025")
        #expect(Format.duration(126) == "2h 6m")
        #expect(Format.heading(0) == "360°")
        #expect(Format.distance(12, decimals: 0) == "12 nm")
    }
}
