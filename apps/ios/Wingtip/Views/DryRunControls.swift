import SwiftUI

/// The dry run's controls over the map: how far along, pause and play,
/// its speed, and the way out.
struct DryRunControls: View {
    @Environment(DryRun.self) private var dryRun

    var body: some View {
        @Bindable var dryRun = dryRun
        HStack(spacing: WingtipSpace.sm) {
            Button { dryRun.running ? dryRun.pause() : dryRun.resume() } label: {
                Image(systemName: dryRun.running ? "pause.fill" : "play.fill").symbolSwap().frame(width: 32, height: 32)
                    // The 44-point hit area round the 32-point glyph, which does not grow.
                    .contentShape(Rectangle().inset(by: -6))
            }
            .accessibilityLabel(dryRun.running ? "Pause the dry run" : "Play the dry run")
            Text(Format.duration(dryRun.flownS / 60)).font(.subheadline.monospacedDigit())
                .accessibilityLabel("Flown \(SpokenFigures.minutes(dryRun.flownS / 60))")
            SpeedPicker(name: "Dry run speed", speed: $dryRun.speed)
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
        // accessibility size, where the four controls would no longer fit.
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
        .padding()
}
