import SwiftUI

/// The dry run's playback bar over the map, laid out as Weather's map
/// timeline and Clock's running timer (docs/design/ios.md §11): Close
/// first at the leading end, back to the plan; Play/Pause, its primary
/// action; the run's own clock in Zulu, with the forecast's valid hour
/// beside it in forecast mode so a forecast is never taken for a report;
/// the speed as a menu; forecast mode; and under them a scrubber along
/// the route with a tick at each nav log row. With forecast mode on, the
/// forecast strip under it (ForecastStrip). It stays where the owner put
/// it, top leading over the map: the planner's sheet holds the foot.
struct DryRunControls: View {
    @Environment(DryRun.self) private var dryRun
    private let forecast = ForecastRun.shared

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            bar
            if forecast.on { ForecastStrip() }
        }
    }

    /// The run's clock, Zulu: its start and the time flown.
    private var zulu: String? {
        dryRun.startedAt.map { Format.zulu($0.addingTimeInterval(dryRun.flownS)) }
    }

    private var bar: some View {
        @Bindable var dryRun = dryRun
        return VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            HStack(spacing: WingtipSpace.sm) {
                Button { dryRun.stop() } label: {
                    Image(systemName: "xmark").frame(width: 32, height: 32)
                        // The 44-point hit area round the 32-point glyph, which does not grow.
                        .contentShape(Rectangle().inset(by: -6))
                }
                .accessibilityLabel("End the dry run")
                Button { dryRun.running ? dryRun.pause() : dryRun.resume() } label: {
                    Image(systemName: dryRun.running ? "pause.fill" : "play.fill").font(.title3).symbolSwap().frame(width: 32, height: 32)
                        .contentShape(Rectangle().inset(by: -6))
                }
                .accessibilityLabel(dryRun.running ? "Pause the dry run" : "Play the dry run")
                VStack(alignment: .leading, spacing: 0) {
                    Text(zulu ?? Format.duration(dryRun.flownS / 60)).font(.subheadline.weight(.semibold).monospacedDigit())
                        .figureTransition(zulu ?? "")
                    if forecast.on, let now = forecast.now {
                        Text("Forecast \(ForecastPlay.hourZ(now))").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(DryRunClock.spoken(zulu: zulu, flownMin: dryRun.flownS / 60, forecastHour: forecast.on ? forecast.now.map(ForecastPlay.hourZ) : nil))
                Spacer(minLength: 0)
                SpeedPicker(name: "Dry run speed", speed: $dryRun.speed)
                // Forecast mode: the run meets the weather forecast for when it
                // gets there. The system's button toggle, which draws its own
                // on look and says on or off to VoiceOver.
                Toggle(isOn: Binding(get: { forecast.on }, set: { forecast.on = $0 })) {
                    Label("Forecast mode", systemImage: forecast.on ? "cloud.sun.fill" : "cloud.sun").symbolSwap()
                }
                .toggleStyle(.button)
                .labelStyle(.iconOnly)
                .contentShape(.interaction, Rectangle().inset(by: -6))
            }
            if dryRun.totalS > 0 {
                Slider(value: Binding(get: { dryRun.flownS }, set: { dryRun.scrub(to: $0) }), in: 0...dryRun.totalS) {
                    Text("Along the route")
                }
                .overlay(alignment: .bottom) { ticks }
                .accessibilityValue("\(SpokenFigures.minutes(dryRun.flownS / 60)) flown of \(SpokenFigures.minutes(dryRun.totalS / 60))")
            }
        }
        .padding(.horizontal, WingtipSpace.md)
        .padding(.vertical, WingtipSpace.xs)
        .frame(maxWidth: 360, alignment: .leading)
        // The system material goes opaque by itself with Reduce Transparency on.
        .floatingGlass(in: RoundedRectangle(cornerRadius: WingtipRadius.card, style: .continuous))
        // Two lines over the map: they stop growing at the second
        // accessibility size, where the controls would no longer fit.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
    }

    /// A tick under the scrubber at each nav log row reached.
    private var ticks: some View {
        GeometryReader { box in
            ForEach(Array(DryRunClock.ticks(dryRun.rowT, total: dryRun.totalS).enumerated()), id: \.offset) { _, at in
                Rectangle().fill(.secondary).frame(width: 1.5, height: 6)
                    .position(x: box.size.width * at, y: box.size.height - 3)
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

/// The bar's words and ticks, apart from the view for the tests.
enum DryRunClock {
    /// Each row's place along the run, 0 to 1, the ends left out.
    static func ticks(_ rowT: [Double], total: Double) -> [Double] {
        guard total > 0 else { return [] }
        return rowT.map { $0 / total }.filter { $0 > 0 && $0 < 1 }
    }

    /// "Run clock fourteen thirty-two Zulu, twelve minutes flown, forecast
    /// for fourteen Zulu".
    static func spoken(zulu: String?, flownMin: Double, forecastHour: String?) -> String {
        [zulu.map { "Run clock \(SpokenFigures.digits(String($0.dropLast()))) Zulu" },
         "\(SpokenFigures.minutes(flownMin)) flown",
         forecastHour.map { "forecast for \(SpokenFigures.digits(String($0.dropLast()))) Zulu" }].compactMap { $0 }.joined(separator: ", ")
    }
}

/// How many times faster than flown, the dry run's and a flown track's
/// replay alike: one control for both, a menu of the same speeds (the UI
/// audit of 2026-11-09 found a menu on one and a segmented control on the
/// other); a menu, as a discrete setting is (docs/decisions/0017), and
/// small enough for the dry run's capsule over the map.
struct SpeedPicker: View {
    let name: String
    @Binding var speed: Double

    var body: some View {
        Picker(name, selection: $speed) {
            ForEach(Replay.speeds, id: \.self) { Text("\(Int($0))×").tag($0) }
        }
        .pickerStyle(.menu)
        .accessibilityLabel(name)
    }
}

#Preview("DryRunControls") {
    DryRunControls()
        .environment(DryRun())
        .environment(Verdict())
        .padding()
}
