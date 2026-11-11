import SwiftUI

/// The airplane's endurance on its profile: how long the usable fuel lasts
/// at the cruise burn, then what is left once each reserve is kept back
/// (the engine's endurance; 14 CFR 91.151(a) by day and night under VFR,
/// 91.167(a)(3) under IFR). Without the airplane's own usable fuel and
/// burn it says so and asks for them in the rows above; it never shows a
/// typical airplane's. Tanks that hold less than a reserve are warned of
/// in caution, never refused.
struct EnduranceSection: View {
    let model: AirplaneProfileModel

    var body: some View {
        Section {
            if let total = model.endurance(.vfrDay), let minutes = total.minutes {
                row("To Dry Tanks", minutes: minutes, caution: false)
                ForEach(EnduranceReserve.allCases) { reserve in
                    if let answer = model.endurance(reserve), let after = answer.afterReserveMin {
                        row(reserve.title, minutes: after, caution: answer.belowReserve,
                            note: "\(Format.duration(answer.reserveMin)) reserve" + (answer.belowReserve ? ", more than the tanks hold" : ""))
                    }
                }
            } else {
                Text("Set the usable fuel and the cruise fuel burn above for the endurance.")
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Endurance")
        }
    }

    private func row(_ title: String, minutes: Double, caution: Bool, note: String? = nil) -> some View {
        LabeledContent {
            HStack(spacing: WingtipSpace.xs) {
                if caution { Image(systemName: "exclamationmark.triangle.fill").accessibilityHidden(true) }
                Text(Format.duration(minutes)).monospacedDigit().contentTransition(.numericText())
            }
            .foregroundStyle(caution ? WingtipInk.caution : .primary)
        } label: {
            Text(title)
            if let note { Text(note) }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(title): \(SpokenFigures.minutes(minutes))" + (note.map { ", \($0)" } ?? ""))
    }
}
