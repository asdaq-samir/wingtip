import Foundation
import Testing
@testable import Wingtip

/// Model Weather's reading at a point and a special-use area's tab, which
/// the app asks the engine rather than keeping its own copy (simplicity
/// audit batches A and B), each checked against the web's shared fixture
/// (apps/web/src/lib/fixtures flowSample.json and specialUseTab.json,
/// bundled into this target by project.yml), which the engine's facade
/// tests and the web's vitest tests read too. The cases decode straight
/// into the contract's own types.
private struct FlowSampleFixture: Decodable {
    struct Cell: Decodable { let about: String; let input: EngineContract.FlowCellInput; let answer: EngineContract.FlowCellAnswer? }
    struct Sample: Decodable { let about: String; let input: EngineContract.FlowSampleInput; let answer: EngineContract.FlowSampleAnswer? }
    let cells: [Cell]
    let samples: [Sample]
}

private struct SpecialUseTabFixture: Decodable {
    struct Case: Decodable { let about: String; let input: EngineContract.SpecialUseTabInput; let answer: EngineContract.SpecialUseTabAnswer? }
    let cases: [Case]
}

private final class FlowFixtureBundle {}

private struct FlowFixtureMissing: Error { let name: String }

private func fixture<T: Decodable>(_ name: String, as type: T.Type) throws -> T {
    guard let url = Bundle(for: FlowFixtureBundle.self).url(forResource: name, withExtension: "json") else { throw FlowFixtureMissing(name: name) }
    return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
}

private func roughly(_ a: Double?, _ b: Double?, within: Double = 1e-9) -> Bool {
    switch (a, b) {
    case (nil, nil): return true
    case let (a?, b?): return abs(a - b) <= within
    default: return false
    }
}

@MainActor
struct FlowFixturesTests {
    @Test func aPointFindsTheFourPixelsRoundItAsEveryAppFindsThem() throws {
        let f = try fixture("flowSample", as: FlowSampleFixture.self)
        #expect(!f.cells.isEmpty)
        for c in f.cells {
            let got = try Engine.flowCell(bounds: c.input.bounds, width: c.input.width, height: c.input.height, lat: c.input.lat, lon: c.input.lon)
            #expect(got?.pixels == c.answer?.pixels, "\(c.about)")
            #expect(roughly(got?.fx, c.answer?.fx) && roughly(got?.fy, c.answer?.fy), "\(c.about)")
        }
    }

    @Test func thePixelsAreReadBetweenAsEveryAppReadsThem() throws {
        let f = try fixture("flowSample", as: FlowSampleFixture.self)
        #expect(!f.samples.isEmpty)
        for c in f.samples {
            let got = try Engine.flowSample(pixels: c.input.pixels, fx: c.input.fx, fy: c.input.fy, unscale: c.input.unscale, vector: c.input.vector)
            #expect((got == nil) == (c.answer == nil), "\(c.about)")
            #expect(roughly(got?.value, c.answer?.value, within: 1e-6), "\(c.about)")
            #expect(roughly(got?.fromDeg, c.answer?.fromDeg, within: 1e-6), "\(c.about)")
        }
    }

    @Test func aWindUnderAKnotIsWrittenCalmWithNoDirection() throws {
        // The fixture's half-knot case: calm, no direction, so no point above the word.
        let f = try fixture("flowSample", as: FlowSampleFixture.self)
        let c = try #require(f.samples.first { $0.about.hasPrefix("Calm: half a knot") })
        let got = try #require(try Engine.flowSample(pixels: c.input.pixels, fx: c.input.fx, fy: c.input.fy, unscale: c.input.unscale, vector: c.input.vector))
        #expect(got.calm && got.fromDeg == nil)
        let said = try FlowReading.of(.wind, value: got.value, unit: "kt", top: nil, fromDeg: got.fromDeg, calm: got.calm)
        #expect(said.figure == "Calm" && said.over == nil)
    }

    @Test func aGridReadsAPointAsTheTwoRulesTogether() throws {
        // The first cell's picture, 4 x 2: its four pixels round the point
        // 0 and 100 of 0..100 in red, west and east. Read at the cell's
        // point, the grid answers what the two rules answer in turn.
        let f = try fixture("flowSample", as: FlowSampleFixture.self)
        let c = try #require(f.cells.first)
        let cell = try #require(c.answer)
        var bytes = [UInt8](repeating: 0, count: c.input.width * c.input.height * 4)
        for (i, red) in zip(cell.pixels, [UInt8(0), 255, 0, 255]) {
            bytes[i * 4] = red
            bytes[i * 4 + 3] = 255
        }
        let grid = FlowGrid(rgba: bytes, width: c.input.width, height: c.input.height, unscale: [0, 100], vector: false, bounds: c.input.bounds)
        let pixels = cell.pixels.map { [Double(bytes[$0 * 4]), Double(bytes[$0 * 4 + 1]), Double(bytes[$0 * 4 + 3])] }
        let asked = try Engine.flowSample(pixels: pixels, fx: cell.fx, fy: cell.fy, unscale: [0, 100], vector: false)
        let read = try grid.reading(lat: c.input.lat, lon: c.input.lon)
        #expect(read != nil && roughly(read?.value, asked?.value))
        // Half way east between 0 and 100, whatever the rows: 50.
        #expect(roughly(read?.value, 50, within: 1e-6))
    }

    @Test func aSpecialUseTabIsWrittenAsEveryAppWritesIt() throws {
        let f = try fixture("specialUseTab", as: SpecialUseTabFixture.self)
        #expect(!f.cases.isEmpty)
        for c in f.cases {
            let i = c.input
            let got = try Engine.specialUseTab(name: i.name, type: i.type, floor: i.floor, ceiling: i.ceiling, excluded: i.excluded)
            #expect(got?.text == c.answer?.text, "\(c.about)")
            guard let text = c.answer?.text else { continue }
            // The map's tab draws the engine's words as they come.
            let tab = ChartMarks.Area.Tab(text: text, at: [31, -99], angle: 0, side: 1)
            let area = ChartMarks.Area(type: i.type ?? "MOA", name: i.name, floorFt: nil, ceilingFt: nil, rings: [], label: [31, -99], tab: tab)
            #expect(SpecialUseTabAnnotation(area)?.text == text, "\(c.about)")
        }
    }
}
