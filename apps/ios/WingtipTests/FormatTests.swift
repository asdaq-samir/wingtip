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
        case "zulu": return AirportWords.date(input as? String).map(Format.zulu)
        case "heading": return number(input).map(Format.heading)
        case "distance": return Format.distance(number(input))
        case "speed": return Format.speed(number(input))
        case "fuel": return Format.fuel(number(input))
        case "weight": return number(input).map(Format.weight)
        case "windCorrection": return number(input).map(Format.windCorrection)
        case "variation": return number(input).map(Format.variation)
        case "spokenAltitude": return Format.spokenAltitude(number(input))
        case "spokenHeading": return number(input).map(Format.spokenHeading)
        case "spokenHeadingMagnetic": return number(input).map(Format.spokenHeadingMagnetic)
        case "spokenHeadingTrue": return number(input).map(Format.spokenHeadingTrue)
        case "spokenDistance": return Format.spokenDistance(number(input))
        case "spokenSpeed": return Format.spokenSpeed(number(input))
        case "spokenFuel": return Format.spokenFuel(number(input))
        case "spokenDuration": return number(input).map(Format.spokenDuration)
        case "spokenZulu": return (input as? String).flatMap { ISO8601DateFormatter().date(from: $0) }.map(Format.spokenZulu)
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

    /// An arrival's day where it is not the day the flight left, counted in
    /// each end's own zone (the web's time.test.ts arrivalDay cases).
    @Test func anArrivalSaysItsDayOnlyWhereItIsNotTheDepartures() throws {
        let chicago = try #require(TimeZone(identifier: "America/Chicago"))
        let denver = try #require(TimeZone(identifier: "America/Denver"))
        let iso = ISO8601DateFormatter()
        func at(_ s: String) throws -> Date { try #require(iso.date(from: s)) }
        // 14:27 CST on Monday 23 November 2026.
        let left = try at("2026-11-23T20:27:00Z")
        #expect(Format.arrivalDay(try at("2026-11-24T05:59:00Z"), left: left, zone: chicago, leftZone: chicago) == nil)
        #expect(Format.arrivalDay(left.addingTimeInterval(1527 * 60), left: left, zone: chicago, leftZone: chicago) == "Tue")
        // Chicago's midnight, 06:00Z, turns the day, not UTC's.
        #expect(Format.arrivalDay(try at("2026-11-24T06:01:00Z"), left: left, zone: chicago, leftZone: chicago) == "Tue")
        // 23:30 MST on the Monday is still Monday where it lands.
        #expect(Format.arrivalDay(try at("2026-11-24T06:30:00Z"), left: left, zone: denver, leftZone: chicago) == nil)
        #expect(Format.arrivalDay(try at("2026-11-30T20:00:00Z"), left: left, zone: chicago, leftZone: chicago) == "11/30")
    }

    /// The forms the audit found written other ways on the iPhone.
    @Test func theAuditsFiguresAreTheTablesForms() {
        #expect(Format.cruiseAltitude(2500) == "FL-025")
        #expect(Format.duration(126) == "2h 6m")
        #expect(Format.heading(0) == "360°")
        #expect(Format.distance(12, decimals: 0) == "12 nm")
    }

    /// The times now written by Foundation's own styles (Duration's units
    /// and time patterns, Date's verbatim style) keep the hand-built
    /// writers' forms: zero minutes, a whole hour, minutes past an hour on
    /// a stopwatch, and the clock in a zone that is not the phone's.
    @Test func foundationStylesWriteTheSameTimes() {
        #expect(Format.duration(0) == "0m" && Format.duration(60) == "1h" && Format.duration(-3) == "0m")
        #expect(Format.navLogTime(18) == "0:18" && Format.navLogTime(65) == "1:05")
        #expect(Format.stopwatch(425) == "7:05" && Format.stopwatch(3900) == "65:00" && Format.stopwatch(-1) == "0:00")
        let at = Date(timeIntervalSince1970: 1_763_733_120) // 2025-11-21 13:52 UTC
        #expect(Format.zulu(at) == "1352Z")
        #expect(Format.clock(at, in: TimeZone(identifier: "America/Chicago")!) == "07:52")
        #expect(Format.clock(at, in: TimeZone(identifier: "Asia/Kolkata")!) == "19:22")
    }

    /// The number words are written by hand, not by the OS's spellOut, so
    /// they hold whatever iOS writes: hyphenated tens, no "and", large ones.
    @Test func numberWordsAreTheTablesOwn() {
        #expect(Format.words(45) == "forty-five")
        #expect(Format.words(101) == "one hundred one")
        #expect(Format.words(2_000_019) == "two million nineteen")
        #expect(Format.words(12.04, decimals: 1) == "twelve")
        #expect(Format.words(-0.02, decimals: 1) == "zero")
        #expect(Format.words(3.25, decimals: 2) == "three point two five")
        #expect(Format.spokenAltitude(1) == "one foot")
    }

    /// A visibility as a report writes it, the engine's FMH-1 Table 6-1
    /// value at or below it: no report writes 11/16, nor rounds up.
    @Test func aVisibilityIsTheReportableOneBelowIt() throws {
        let (whole, fraction) = try Format.reportedVisibility(0.7456)
        #expect(whole == 0 && fraction == "5/8")
        let mile = try Format.reportedVisibility(1.625), four = try Format.reportedVisibility(4.97)
        #expect(mile.whole == 1 && mile.fraction == "5/8")
        #expect(four.whole == 4 && four.fraction == nil)
    }
}
