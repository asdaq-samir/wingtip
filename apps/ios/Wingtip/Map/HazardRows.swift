import SwiftUI

/// Terrain Hazards, the Map card's rows under its layers (its one home, as
/// the web's HazardChoice): Off, On, or In Flight, which turns it on by
/// itself at flying speed (the engine's `shown`); while it is not off, Red
/// Within offers the engine's clearances, each a 14 CFR minimum
/// (TerrainHazard). Segmented controls, as discrete settings are.
struct HazardRows: View {
    @AppStorage(TerrainHazard.Keys.setting) private var setting = TerrainHazard.Setting.off
    @AppStorage(TerrainHazard.Keys.clearanceFt) private var picked: Double?

    var body: some View {
        LabeledContent("Terrain Hazards") {
            Picker("Terrain Hazards", selection: $setting) {
                ForEach(TerrainHazard.Setting.allCases) { Text($0.label).tag($0) }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier("hazard-setting")
        }
        // The clearances are the engine's: none offered where it cannot answer.
        if setting != .off, let figures = try? TerrainHazard.clearances(picked: picked) {
            LabeledContent("Red Within") {
                Picker("Red Within", selection: Binding(get: { figures.inUse }, set: { picked = $0 })) {
                    ForEach(figures.offered, id: \.self) { Text(Format.altitude($0)).tag($0) }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityIdentifier("hazard-clearance")
            }
        }
    }
}
