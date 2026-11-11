import SwiftUI

/// The Profile card's foot: the altitude flown's cautions, how the planner
/// chose it, and the same reasons in plain words (AltitudeWhy). Each figure
/// is the planner's, with the rule it keeps.
struct ProfileReasons: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        // Any row may be flown; one outside the planner's legal altitudes
        // is said here, its reasons in Cautions where the planner gives them.
        if let own = plan.ownAltitudeFt, !plan.ownAltitudeLegal {
            Section {
                Label("\(Format.cruiseAltitude(own)) is outside the planner's legal altitudes; flown with its warnings.",
                      systemImage: "exclamationmark.triangle")
                    .font(.footnote).foregroundStyle(WingtipInk.caution)
            }
        }
        if let cautions = plan.altitude?.cautions, !cautions.isEmpty {
            Section {
                ForEach(cautions) { caution in
                    VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                        Text("\(Format.cruiseAltitude(caution.altitudeFt)) \(caution.fromIdent) → \(caution.toIdent)").font(.subheadline.weight(.semibold))
                        ForEach(caution.reasons, id: \.self) { Text("• \($0)").font(.footnote) }
                    }
                    .foregroundStyle(WingtipInk.caution)
                }
            } header: {
                Label("Cautions", systemImage: "exclamationmark.triangle")
            }
        }
        if let selection = plan.altitude?.altitudeSelection {
            Section("How the Altitude Was Chosen") {
                LabeledContent("Floor", value: "\(Format.altitude(selection.floorFt)), the terrain and obstacles (14 CFR 91.119)")
                if let ceiling = selection.serviceCeilingFt { LabeledContent("Ceiling", value: "\(Format.altitude(ceiling)), the airplane's") }
                if let clouds = selection.cloudBaseFt { LabeledContent("Clouds", value: "base \(Format.altitude(clouds)) (14 CFR 91.155)") }
                if let shelf = selection.airspaceCeilingFt { LabeledContent("Class B", value: "from \(Format.altitude(shelf)) (14 CFR 91.131)") }
                if let candidates = selection.candidatesFt, !candidates.isEmpty {
                    LabeledContent("Legal", value: candidates.map { Format.cruiseAltitude($0) }.joined(separator: " "))
                }
            }
        }
        // The same reasons in plain words, on the phone (AltitudeWhy).
        AltitudeWhySection(line: plan.altitude, flownFt: plan.altitudeFt, choice: plan.altitudeChoice)
    }
}
