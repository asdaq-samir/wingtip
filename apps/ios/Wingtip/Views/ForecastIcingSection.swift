import SwiftUI

/// The Brief's forecast icing, a row a leg (ForecastIcing): the severity
/// at the leg's altitude and the share of the leg in it, and the levels
/// icing is forecast between over the leg, for a way out above or below
/// (AIM 7-1-19: "go to an altitude where the temperature is above
/// freezing"). Each mark has its own shape, not colour alone.
struct ForecastIcingSection: View {
    let model: ForecastIcing
    let legs: [Leg]

    var body: some View {
        if let answer = model.answer {
            Section {
                ForEach(answer.legs, id: \.index) { leg in
                    let on = legs.indices.contains(leg.index) ? legs[leg.index] : nil
                    let iced = ForecastIcing.iced(leg)
                    HStack(alignment: .top, spacing: WingtipSpace.md) {
                        Image(systemName: leg.severity == nil ? "questionmark.circle" : iced ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                            .foregroundStyle(leg.severity == nil ? Color.secondary : iced ? WingtipInk.caution : WingtipInk.go)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(on.map { "\($0.from) → \($0.to)" } ?? "Leg \(leg.index + 1)").lineLimit(1)
                            Text(ForecastIcing.value(leg)).fontWeight(.semibold)
                                .foregroundStyle(iced ? WingtipInk.caution : Color.primary)
                            if let detail = ForecastIcing.detail(leg) {
                                Text(detail).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            } header: {
                SectionTitle("Forecast Icing")
            } footer: {
                // The source and its issue, a credit.
                Text("AWC CIP and FIP, issued \(AirportWords.date(answer.issued).map(Format.zulu) ?? answer.issued)")
            }
        } else if let problem = model.problem {
            Section { ProblemLine(problem) } header: { SectionTitle("Forecast Icing") }
        } else if model.asking {
            Section { ProgressView("Fetching the forecast icing along the legs…") } header: { SectionTitle("Forecast Icing") }
        }
    }
}

#Preview("ForecastIcingSection") {
    List { ForecastIcingSection(model: ForecastIcing(), legs: []) }
}
