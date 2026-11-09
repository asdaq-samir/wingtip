import SwiftUI

/// The dry run's controls over the map: how far along, pause and play,
/// its speed, forecast mode, and the way out; with forecast mode on, the
/// forecast strip under them (ForecastStrip).
struct DryRunControls: View {
    @Environment(DryRun.self) private var dryRun
    private let forecast = ForecastRun.shared

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            controls
            if forecast.on { ForecastStrip() }
        }
    }

    private var controls: some View {
        @Bindable var dryRun = dryRun
        return HStack(spacing: WingtipSpace.sm) {
            Button { dryRun.running ? dryRun.pause() : dryRun.resume() } label: {
                Image(systemName: dryRun.running ? "pause.fill" : "play.fill").symbolSwap().frame(width: 32, height: 32)
                    // The 44-point hit area round the 32-point glyph, which does not grow.
                    .contentShape(Rectangle().inset(by: -6))
            }
            .accessibilityLabel(dryRun.running ? "Pause the dry run" : "Play the dry run")
            Text(Format.duration(dryRun.flownS / 60)).font(.subheadline.monospacedDigit())
                .figureTransition(Format.duration(dryRun.flownS / 60))
                .accessibilityLabel("Flown \(SpokenFigures.minutes(dryRun.flownS / 60))")
            SpeedPicker(name: "Dry run speed", speed: $dryRun.speed)
            // Forecast mode: the run meets the weather forecast for when it
            // gets there. Filled on a tinted disc while on, the pressed look.
            Button { forecast.on.toggle() } label: {
                Image(systemName: forecast.on ? "cloud.sun.fill" : "cloud.sun").symbolSwap().frame(width: 32, height: 32)
                    .background { if forecast.on { Circle().fill(.tint.opacity(0.2)) } }
                    .contentShape(Rectangle().inset(by: -6))
            }
            .accessibilityLabel("Forecast mode")
            .accessibilityValue(forecast.on ? "On" : "Off")
            .accessibilityAddTraits(forecast.on ? .isSelected : [])
            Button { dryRun.stop() } label: {
                Image(systemName: "xmark").frame(width: 32, height: 32)
                    .contentShape(Rectangle().inset(by: -6))
            }
            .accessibilityLabel("End the dry run")
        }
        .padding(.horizontal, WingtipSpace.sm)
        // The system material goes opaque by itself with Reduce Transparency on.
        .floatingGlass(in: Capsule())
        // One line over the map: it stops growing at the second
        // accessibility size, where the five controls would no longer fit.
        .dynamicTypeSize(...DynamicTypeSize.accessibility2)
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
