import Foundation
import Observation
import UIKit

/// The radar and satellite loop's five, as the owner listed them
/// (2026-11-09): off, the radar, the GOES infrared or visible picture, or
/// the radar over the infrared. The raw value is the planner's `kind`.
enum LoopKind: String, CaseIterable, Identifiable, Sendable {
    case off, radar, ir, visible, both

    var id: String { rawValue }

    var label: String {
        switch self {
        case .off: "Off"
        case .radar: "Radar"
        case .ir: "Satellite IR"
        case .visible: "Satellite Visible"
        case .both: "Radar and IR"
        }
    }
}

/// How fast the loop plays: a menu, as a discrete setting is here.
enum LoopSpeed: String, CaseIterable, Identifiable, Sendable {
    case slow, normal, fast

    var id: String { rawValue }
    var label: String { rawValue.capitalized }

    /// How long each frame is shown, the web's FRAME_MS.
    var frame: Duration {
        switch self {
        case .slow: .milliseconds(900)
        case .normal: .milliseconds(500)
        case .fast: .milliseconds(250)
        }
    }
}

/// The radar and satellite loop on the map (the owner, 2026-11-09, the
/// web's features/weather-loop): the frames the planner lists for the
/// pick in Setup's Map section (wingtip.weather_loop, asked again every
/// two and a half minutes), the one shown, and play, pause and scrub. It
/// plays by itself once the map says the frames' tiles have loaded
/// (WeatherLoopLayer), so nothing flickers in; not under Reduce Motion,
/// which keeps the newest frame still; and it pauses while the app is in
/// the background (WeatherLoopBar's scene phase).
@MainActor
@Observable
final class WeatherLoop {
    static let shared = WeatherLoop()
    static let kindKey = "weatherLoop", speedKey = "weatherLoopSpeed"

    /// The newest frame is held this long before the loop starts again.
    static let newestHold: Duration = .milliseconds(1500)
    /// How often the frames are asked for again: half the radar's pace.
    static let refresh: Duration = .seconds(150)

    var kind: LoopKind {
        didSet {
            UserDefaults.standard.set(kind.rawValue, forKey: Self.kindKey)
            if kind != oldValue { restart() }
        }
    }

    var speed: LoopSpeed {
        didSet { UserDefaults.standard.set(speed.rawValue, forKey: Self.speedKey) }
    }

    private(set) var frames: [APILoopFrame] = []
    /// How old the newest may be before the bar says old (the planner's).
    private(set) var oldAfterS: Double = 900
    private(set) var failed = false
    private(set) var playing = false
    /// The frames' tiles in view have loaded, or the preload's cap passed.
    private(set) var ready = false
    /// The frame shown; nil follows the newest, so a refresh shows it.
    private(set) var index: Int?
    private var started = false
    private var resume = false
    private var fetching: Task<Void, Never>?
    private var clock: Task<Void, Never>?

    private init() {
        kind = LoopKind(rawValue: UserDefaults.standard.string(forKey: Self.kindKey) ?? "") ?? .off
        speed = LoopSpeed(rawValue: UserDefaults.standard.string(forKey: Self.speedKey) ?? "") ?? .normal
        restart()
    }

    /// The frame's place in `frames`, -1 with none.
    var shown: Int { frames.isEmpty ? -1 : min(index ?? frames.count - 1, frames.count - 1) }
    var frame: APILoopFrame? { shown >= 0 ? frames[shown] : nil }

    /// A new pick starts afresh: its frames asked for, the newest shown.
    private func restart() {
        fetching?.cancel()
        clock?.cancel()
        (frames, index, playing, ready, started, failed, resume) = ([], nil, false, false, false, false, false)
        guard kind != .off else { return }
        fetching = Task { await self.fetchForever() }
    }

    private func fetchForever() async {
        while !Task.isCancelled {
            do {
                // The last list kept, with its age, when there is no signal (KeptForAir).
                let asked = kind.rawValue
                let answer = try await KeptForAir.answer(.weatherLoop, key: asked) {
                    try await Planner.call { try await $0.weatherLoopFrames(query: .init(kind: asked)).ok.body.json }
                }.value
                if answer.frames.map(\.valid) != frames.map(\.valid) { ready = false }
                frames = answer.frames
                oldAfterS = answer.oldAfterS
                failed = false
            } catch is CancellationError {
                return
            } catch {
                // No signal, or the planner down: what was heard stands.
                if frames.isEmpty { failed = true }
            }
            try? await Task.sleep(for: Self.refresh)
        }
    }

    /// Told by the map's layer once the frames in view have loaded: the
    /// loop plays by itself the first time, unless Reduce Motion is on or
    /// the system asks apps to do less (Self.savingResources).
    func loaded() {
        guard !ready else { return }
        ready = true
        guard !started, frames.count >= 2 else { return }
        started = true
        if !UIAccessibility.isReduceMotionEnabled, !Self.savingResources {
            index = 0
            play()
        }
    }

    /// iOS 27's ask to scale back live effects (UIApplication's
    /// systemPrefersReducedResourceUsage): the loop then waits for Play
    /// rather than starting by itself, the newest frame shown. Never so
    /// before iOS 27.
    private static var savingResources: Bool {
        if #available(iOS 27.0, *) { UIApplication.shared.systemPrefersReducedResourceUsage } else { false }
    }

    func toggle() {
        started = true
        resume = false
        if playing { pause() } else { play() }
    }

    func seek(_ i: Int) {
        started = true
        pause()
        index = max(0, min(i, frames.count - 1))
    }

    private func play() {
        guard frames.count >= 2 else { return }
        playing = true
        clock?.cancel()
        clock = Task { await self.run() }
    }

    private func pause() {
        playing = false
        clock?.cancel()
    }

    /// Each frame for its time, the newest held longer, round again.
    private func run() async {
        while playing, !Task.isCancelled {
            let at = shown
            try? await Task.sleep(for: at == frames.count - 1 ? Self.newestHold : speed.frame)
            guard playing, !Task.isCancelled, !frames.isEmpty else { return }
            index = (at + 1) % frames.count
        }
    }

    /// The app gone to the background or back: paused while away, and
    /// on again on return if it was playing.
    func away(_ away: Bool) {
        if away {
            resume = playing
            pause()
        } else if resume {
            resume = false
            play()
        }
    }

    /// A frame's time as the bar writes it: Zulu, this phone's clock and
    /// zone, its age, and whether it is past the source's own pace.
    static func time(of frame: APILoopFrame, now: Date, oldAfterS: Double) -> (zulu: String, local: String, age: String, old: Bool)? {
        guard let at = try? Date(frame.valid, strategy: .iso8601) else { return nil }
        let minutes = now.timeIntervalSince(at) / 60
        let local = at.formatted(date: .omitted, time: .shortened) + " " + (TimeZone.current.abbreviation(for: at) ?? "")
        let age = minutes < 1 ? "just now" : "\(Format.duration(floor(minutes))) ago"
        return (Format.zulu(at), local, age, minutes * 60 > oldAfterS)
    }
}
