import CoreGraphics
import CoreLocation
import Foundation
import Observation
import UIKit

/// A field's picture painted for the map (FlowPaint), with the box it covers.
final class PaintedField: @unchecked Sendable {
    let key: String
    let image: CGImage
    /// [west, south, east, north], degrees.
    let box: [Double]
    let opacity: CGFloat

    init(key: String, image: CGImage, box: [Double], opacity: CGFloat) {
        (self.key, self.image, self.box, self.opacity) = (key, image, box, opacity)
    }
}

/// The model weather on the map (the web's features/weather-flow, the
/// owner, 2026-11-11 and 12): the field picked in the Map card, the
/// timeline the planner lists (GET /api/weather/flow, wingtip.weather_flow:
/// the last hour, now and every second hour to twelve ahead), asked again
/// every ten minutes, the hour shown -- now until the pilot scrubs or
/// plays -- and play, which steps through the hours once and stops on the
/// last (WCAG 2.2.2), never under Reduce Motion, and pauses while the app
/// is in the background. With it the hour's picture painted, its G-AIRMETs
/// and the value where the pilot tapped. No streaks: the owner took the
/// fields and the AIRMETs without them on the phone (2026-11-12).
@MainActor
@Observable
final class ModelWeather {
    static let shared = ModelWeather()
    static let fieldKey = "modelWeather", levelKey = "modelWeatherLevel"
    /// The web's REFRESH_MS and FRAME_MS.
    static let refresh: Duration = .seconds(600)
    static let frameTime: Duration = .milliseconds(1200)
    /// The G-AIRMETs' box: the lower 48 and round it, where they are issued
    /// (aviationweather.gov, "Contiguous 48 United States"), as the web asks.
    static let conus = (south: 18.0, west: -130.0, north: 56.0, east: -61.0)

    enum Span: String, CaseIterable, Identifiable, Sendable {
        case hour = "1h", twelve = "12h"
        var id: String { rawValue }
    }

    var field: FlowFieldKind {
        didSet {
            UserDefaults.standard.set(field.rawValue, forKey: Self.fieldKey)
            if field != oldValue { picked() }
        }
    }

    var levelPick: String {
        didSet {
            UserDefaults.standard.set(levelPick, forKey: Self.levelKey)
            if levelPick != oldValue { paint() }
        }
    }

    var span: Span = .twelve {
        didSet { if span != oldValue { (index, playing) = (nil, false); paint() } }
    }

    private(set) var layer: APIFlowLayer?
    private(set) var failed = false
    private(set) var playing = false
    /// The hour shown; nil follows now.
    private(set) var index: Int?
    /// The hour's picture as drawn, nil while it comes.
    private(set) var painted: PaintedField?
    /// The hour's G-AIRMETs (the planner's weather map at its time).
    private(set) var airmets: [APIWeatherArea] = []
    /// Where the pilot tapped, and what the field is there.
    private(set) var point: CLLocationCoordinate2D?
    private(set) var reading: FlowReading?
    /// Why there is no reading where the pilot tapped: an engine rule that
    /// failed, said in the bar (ProblemLine), never a hazard word.
    private(set) var readingProblem: String?

    @ObservationIgnored private var grids: [String: FlowGrid] = [:]
    @ObservationIgnored private var fetching: Task<Void, Never>?
    @ObservationIgnored private var painting: Task<Void, Never>?
    @ObservationIgnored private var clock: Task<Void, Never>?
    @ObservationIgnored private var airmetsAt: Double?
    @ObservationIgnored private var resume = false

    private init() {
        field = FlowFieldKind(rawValue: UserDefaults.standard.string(forKey: Self.fieldKey) ?? "") ?? .off
        levelPick = UserDefaults.standard.string(forKey: Self.levelKey) ?? "sfc"
        picked()
    }

    // MARK: The timeline

    var frames: [APIFlowFrame] { layer?.frames ?? [] }
    /// The frame that is now: the newest whose hour has come.
    var nowIndex: Int { frames.lastIndex { $0.past } ?? 0 }
    var shown: Int { frames.isEmpty ? -1 : min(index ?? nowIndex, frames.count - 1) }
    var frame: APIFlowFrame? { shown >= 0 ? frames[shown] : nil }

    /// The frames the timeline runs over: on the precipitation's 1h the
    /// hours already past, the radar's where it has its mosaic.
    var steps: [Int] {
        let all = Array(frames.indices)
        guard field == .precip, span == .hour else { return all }
        let past = all.filter { frames[$0].past }
        return past.isEmpty ? all : past
    }

    /// A frame's hour as the bar says it: "Now", or how far ahead or back.
    func hourName(_ i: Int) -> String {
        guard frames.indices.contains(i), frames.indices.contains(nowIndex) else { return "" }
        if i == nowIndex { return "Now" }
        guard let at = Self.date(frames[i].valid), let now = Self.date(frames[nowIndex].valid) else { return "" }
        let hours = Int((at.timeIntervalSince(now) / 3600).rounded())
        return hours > 0 ? "+\(hours) h" : "\(hours) h"
    }

    static func date(_ iso: String) -> Date? { try? Date(iso, strategy: .iso8601) }

    /// The level shown and the picture it means, the gusts the surface's.
    var level: String? { FlowLevels.shown(layer, field, picked: levelPick) }
    var file: String { field == .gust ? "gust" : FlowLevels.file(field.rawValue, level) }
    /// An hour past on the precipitation: the radar's mosaic, observed.
    var radarTiles: String? { field == .precip && frame?.past == true ? frame?.radarTiles : nil }

    func seek(_ i: Int) {
        pause()
        index = max(0, min(i, frames.count - 1))
        paint()
    }

    func now() {
        pause()
        index = nil
        paint()
    }

    func toggle() {
        if playing { pause(); return }
        guard steps.count > 1, !UIAccessibility.isReduceMotionEnabled else { return }
        if let first = steps.first, let last = steps.last, shown >= last || shown < first { index = first }
        playing = true
        paint()
        clock?.cancel()
        clock = Task { await self.run() }
    }

    private func pause() {
        playing = false
        clock?.cancel()
    }

    /// Each hour for its time, stopping on the last.
    private func run() async {
        while playing, !Task.isCancelled {
            try? await Task.sleep(for: Self.frameTime)
            guard playing, !Task.isCancelled else { return }
            guard let last = steps.last, shown + 1 <= last else { pause(); return }
            index = shown + 1
            paint()
        }
    }

    /// The app gone to the background or back: paused while away.
    func away(_ away: Bool) {
        if away {
            resume = playing
            pause()
        } else if resume {
            resume = false
            toggle()
        }
    }

    // MARK: Fetching and painting

    private func picked() {
        fetching?.cancel()
        pause()
        (point, reading, readingProblem, painted, airmets, airmetsAt, index) = (nil, nil, nil, nil, [], nil, nil)
        guard field != .off else { return }
        fetching = Task { await self.fetchForever() }
    }

    private func fetchForever() async {
        while !Task.isCancelled {
            do {
                let answer = try await Planner.fetch(APIFlowLayer.self, "/api/weather/flow")
                layer = answer
                failed = false
                paint()
            } catch is CancellationError {
                return
            } catch {
                if layer == nil { failed = true }
            }
            try? await Task.sleep(for: Self.refresh)
        }
    }

    /// A frame's picture of a file as values, fetched once at its version.
    func grid(_ frame: APIFlowFrame, _ file: String) async -> FlowGrid? {
        guard let layer, frame.fields.contains(file), let spec = layer.fields[String(file.split(separator: "-")[0])] else { return nil }
        let version = frame.versions?[file]
        let key = "\(frame.id)/\(file)/\(version ?? "")"
        if let kept = grids[key] { return kept }
        guard let data = try? await Planner.data(for: Planner.get("/api/weather/flow/\(frame.id)/\(file).png", ["v": version])) else { return nil }
        let bounds = file == "world" ? (layer.worldBounds ?? layer.bounds) : layer.bounds
        let grid = await Task.detached { FlowGrid.decode(png: data, field: spec, bounds: bounds) }.value
        if let grid {
            // The hours of one field at one level are kept; another's let go.
            if grids.count > 24 { grids.removeAll() }
            grids[key] = grid
        }
        return grid
    }

    /// The hour's picture painted for the map, its AIRMETs asked, the
    /// reading kept up with it, and the next hour fetched ahead.
    private func paint() {
        guard field != .off, let frame, let look = FlowLooks.look(field) else { painted = nil; return }
        let file = self.file, key = "\(frame.id)/\(file)/\(frame.versions?[file] ?? "")/\(field.rawValue)"
        askAirmets(frame)
        painting?.cancel()
        guard radarTiles == nil else { painted = nil; read(); return }
        guard painted?.key != key else { read(); return }
        painting = Task {
            guard let grid = await grid(frame, file), !Task.isCancelled else { return }
            let ramp = look.ramp, opacity = look.opacity
            let made = await Task.detached {
                FlowPaint.image(grid, ramp: ramp).map { PaintedField(key: key, image: $0, box: FlowPaint.box(of: grid), opacity: opacity) }
            }.value
            guard !Task.isCancelled, let made else { return }
            painted = made
            read()
            if shown + 1 < frames.count { _ = await self.grid(frames[shown + 1], file) }
        }
    }

    private func askAirmets(_ frame: APIFlowFrame) {
        guard let at = Self.date(frame.valid)?.timeIntervalSince1970, at != airmetsAt else { return }
        airmetsAt = at
        let box = Self.conus
        Task {
            let map = try? await Planner.fetch(APIWeatherMap.self, "/api/weather/map", [
                "south": String(box.south), "west": String(box.west), "north": String(box.north), "east": String(box.east),
                "at": String(Int(at)),
            ])
            guard airmetsAt == at else { return }
            airmets = (map?.advisories ?? []).filter { $0.kind == "gairmet" }
        }
    }

    // MARK: The value at a point

    /// A tap on the map with nothing else under it: the value there.
    func tapped(_ at: CLLocationCoordinate2D) {
        point = at
        read()
    }

    private func read() {
        guard let point, let frame, let layer else { (reading, readingProblem) = (nil, nil); return }
        let field = self.field, file = self.file, level = self.level
        let spec = layer.fields[field == .gust ? "gust" : field.rawValue]
        // The temperature beside the precipitation, and beside the wind at a
        // level (Max is no one level, so has none).
        let tempFile: String? = field == .precip ? "temp" : (field == .wind && level != nil && level != "max" ? FlowLevels.file("temp", level) : nil)
        Task {
            guard let grid = await grid(frame, file) else { (reading, readingProblem) = (nil, nil); return }
            let tempGrid: FlowGrid? = if let tempFile { await self.grid(frame, tempFile) } else { nil }
            guard self.point?.latitude == point.latitude, self.point?.longitude == point.longitude else { return }
            do {
                guard let at = try grid.reading(lat: point.latitude, lon: point.longitude) else {
                    (reading, readingProblem) = (nil, nil)
                    return
                }
                let temp = try tempGrid?.reading(lat: point.latitude, lon: point.longitude)?.value
                reading = try FlowReading.of(field, value: at.value, unit: spec?.unit ?? "", top: spec?.unscale.last,
                                             fromDeg: at.fromDeg, calm: at.calm, tempC: temp)
                readingProblem = nil
            } catch {
                (reading, readingProblem) = (nil, "The \(field.label.lowercased()) there couldn't be worked out: \(error.localizedDescription)")
            }
        }
    }
}
