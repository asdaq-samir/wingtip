import SwiftUI

/// The profile's altitude slider, upright beside the side view as
/// ForeFlight's is (the owner's spec of 2026-11-10): the system's own
/// `Slider` turned a quarter, since the iOS 27.2 SDK has no vertical
/// orientation for it (its swiftinterface was searched). It steps through
/// the engine's altitudes, low at the foot and high at the top, and only
/// previews: the plan changes on Set. VoiceOver keeps the stock slider's
/// adjustable action, swiping up and down a row at a time, and hears the
/// altitude with what the ground under the route comes within of it.
struct AltitudeSlider: View {
    /// The engine's altitudes, highest first, as `altitude_wheel` answers.
    let rows: [Double]
    /// The altitude previewed, feet MSL.
    @Binding var previewFt: Double
    /// The words VoiceOver says for an altitude: it and its clearance.
    let spoken: (Double) -> String
    /// The slider's length, the side view's height.
    let length: CGFloat

    /// The rows low to high, the slider's own way up.
    private var climbing: [Double] { rows.reversed() }

    /// The row nearest the preview, so a preview between rows (Auto, the
    /// airplane's own altitude) still sits the thumb where it is.
    private var index: Double {
        guard !climbing.isEmpty else { return 0 }
        let nearest = climbing.indices.min { abs(climbing[$0] - previewFt) < abs(climbing[$1] - previewFt) } ?? 0
        return Double(nearest)
    }

    var body: some View {
        if climbing.count > 1 {
            Slider(value: Binding(get: { index }, set: { step($0) }), in: 0...Double(climbing.count - 1), step: 1) {
                Text("Altitude")
            }
            .labelsHidden()
            .frame(width: length)
            .rotationEffect(.degrees(-90))
            // Turned, the slider takes the width of a hit area and the side
            // view's height: 44 pt across (HIG Buttons), its stock size kept.
            .frame(width: 44, height: length)
            .contentShape(Rectangle())
            .accessibilityValue(spoken(previewFt))
            .accessibilityHint("Swipe up or down to preview another altitude; Set flies it.")
        }
    }

    private func step(_ value: Double) {
        let i = min(max(Int(value.rounded()), 0), climbing.count - 1)
        guard climbing[i] != previewFt else { return }
        previewFt = climbing[i]
        Feel.tap(.altitude)
    }
}
