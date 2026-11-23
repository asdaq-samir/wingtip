import SwiftUI

/// The Brief's line for the Air Defense Identification Zones the route
/// meets (the engine's route_adiz, 14 CFR part 99), a caution among the
/// glance's lines as on the web: the finding and what part 99 asks in one
/// line, opening to what it asks in the first zone met, why, and the rule
/// cited, a tap to its paragraph. Warn, never limit. Nothing where the
/// route meets none; the engine's refusal said where it refused.
struct AdizLine: View {
    let result: Result<RouteAdiz.Brief?, any Error>
    @State private var isExpanded = false

    var body: some View {
        switch result {
        case .success(let brief?):
            DisclosureGroup(isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                    Text(brief.action).font(.subheadline)
                    CitedText(brief.why).font(.footnote).foregroundStyle(.secondary)
                    CitedText(brief.cite).font(.footnote).foregroundStyle(.secondary)
                }
            } label: {
                Label {
                    Text(brief.line)
                } icon: {
                    Image(systemName: FindingStyle.symbol("caution")).foregroundStyle(FindingStyle.colour("caution"))
                        .accessibilityLabel(FindingStyle.word("caution"))
                }
                .accessibilityElement(children: .combine)
            }
            .accessibilityIdentifier("brief-adiz")
        case .success(nil):
            EmptyView()
        case .failure:
            ProblemLine(result, "Whether the route meets an ADIZ")
        }
    }
}
