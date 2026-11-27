import SwiftUI

/// The chart's Dimmer and Contrast, as the web's Map card has them under
/// Look (lib/map/chartLook; the owner, 2026-11-18: "can we have a dimmer
/// and contrast sliders under sunlight and remove it from the
/// appearance?"): the Dimmer kept apart for light and for dark, Contrast
/// one offset on the look's own. Plain figures of a display, not aviation
/// ones; continuous settings, so sliders (docs/design/rules.md §147).
nonisolated enum ChartLook {
    /// The night's dim before anyone moves it: half the chart's light, the
    /// look the night had before the Dimmer (the web's NIGHT_DIM).
    static let nightDim = WingtipChartLook.nightDim
    /// The deepest dim: the paper's white at 30%, about the least the
    /// chart's small print still reads at (the web's DIM_MAX).
    static let dimMax = WingtipChartLook.dimMax
    /// The Contrast offset's ends, as the web's CONTRAST_MIN and _MAX.
    static let contrastMin = WingtipChartLook.contrastMin, contrastMax = WingtipChartLook.contrastMax
    /// Each slider's step, as the web's LOOK_STEP.
    static let step = WingtipChartLook.step

    nonisolated enum Keys {
        static let dimLight = "chartDimLight"
        static let dimDark = "chartDimDark"
        static let contrast = "chartContrast"
    }

    /// How much of the night's ground is laid over the chart: the Dimmer
    /// kept for the appearance drawn, within 0 to dimMax.
    static func shade(dimLight: Double, dimDark: Double, dark: Bool) -> CGFloat {
        CGFloat(min(dimMax, max(0, dark ? dimDark : dimLight)))
    }

    /// The Contrast offset within its ends; 0 the look as it is.
    static func offset(_ contrast: Double) -> Double { min(contrastMax, max(contrastMin, contrast)) }

    /// A setting in whole steps, for a key: the slider's 0.15 is kept as
    /// 0.15000000000000002 after three steps, which named a tile store of
    /// its own (ChartTileRenderer's prefix).
    static func steps(_ value: Double) -> Int { Int((value / step).rounded()) }
}

/// The Dimmer and Contrast as kept on the device, for the map that draws
/// the chart by them (ChartMap).
struct ChartLookKept: DynamicProperty {
    @AppStorage(ChartLook.Keys.dimLight) private var dimLight = 0.0
    @AppStorage(ChartLook.Keys.dimDark) private var dimDark = ChartLook.nightDim
    @AppStorage(ChartLook.Keys.contrast) private var contrast = 0.0

    func shade(dark: Bool) -> CGFloat { ChartLook.shade(dimLight: dimLight, dimDark: dimDark, dark: dark) }
    var offset: Double { ChartLook.offset(contrast) }
}

/// The Dimmer and Contrast rows under the Map card's Look, a stock slider
/// each, the Dimmer the one for the appearance on screen.
struct ChartLookRows: View {
    @Environment(\.colorScheme) private var scheme
    @AppStorage(ChartLook.Keys.dimLight) private var dimLight = 0.0
    @AppStorage(ChartLook.Keys.dimDark) private var dimDark = ChartLook.nightDim
    @AppStorage(ChartLook.Keys.contrast) private var contrast = 0.0
    /// Contrast while its slider is held: each change draws the whole chart
    /// again from its tiles (ChartTileOverlay), so the map takes it as the
    /// finger lifts; a step by VoiceOver or the keyboard at once.
    @State private var held: Double?

    var body: some View {
        let dim = scheme == .dark ? $dimDark : $dimLight
        Slider(value: dim, in: 0...ChartLook.dimMax, step: ChartLook.step) {
            Text("Dimmer")
        } minimumValueLabel: {
            Image(systemName: "sun.max").accessibilityLabel("Bright")
        } maximumValueLabel: {
            Image(systemName: "sun.min").accessibilityLabel("Dim")
        }
        .accessibilityValue(Text("\(Int((dim.wrappedValue * 100).rounded())) percent dimmed"))
        .accessibilityIdentifier("chart-dimmer")
        let shown = Binding(get: { held ?? contrast }, set: { if held != nil { held = $0 } else { contrast = $0 } })
        Slider(value: shown, in: ChartLook.contrastMin...ChartLook.contrastMax, step: ChartLook.step) {
            Text("Contrast")
        } minimumValueLabel: {
            Image(systemName: "circle").accessibilityLabel("Flatter")
        } maximumValueLabel: {
            Image(systemName: "circle.lefthalf.filled").accessibilityLabel("Harder")
        } onEditingChanged: { editing in
            if editing {
                held = contrast
            } else if let kept = held {
                held = nil
                contrast = kept
            }
        }
        .accessibilityValue(Text("\(Int((shown.wrappedValue * 100).rounded())) percent"))
        .accessibilityIdentifier("chart-contrast")
    }
}
