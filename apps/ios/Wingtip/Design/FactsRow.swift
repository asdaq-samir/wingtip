import SwiftUI

/// A row of facts, a grey caption over each value, as Maps' place card
/// and Apple's own summaries lay theirs out (docs/design/ios.md §0, §2a):
/// up to four across, two by two at the accessibility sizes so nothing is
/// truncated (HIG Layout: "horizontally adjacent views may need to stack
/// vertically"). The values are given as the engine or planner sent
/// them; this only lays them out.
struct FactsRow: View {
    struct Fact: Identifiable {
        let label: String
        let value: String
        /// What VoiceOver says of the value, where the written form is
        /// shorthand ("1:25", "FL-045").
        var spoken: String?
        var colour: Color?
        var id: String { label }
    }

    let facts: [Fact]
    @Environment(\.dynamicTypeSize) private var size

    var body: some View {
        if size.isAccessibilitySize {
            Grid(horizontalSpacing: WingtipSpace.sm, verticalSpacing: WingtipSpace.md) {
                ForEach(Array(stride(from: 0, to: facts.count, by: 2)), id: \.self) { i in
                    GridRow {
                        cell(facts[i])
                        if i + 1 < facts.count { cell(facts[i + 1]) }
                    }
                }
            }
        } else {
            HStack(alignment: .top, spacing: WingtipSpace.sm) {
                ForEach(facts) { cell($0) }
            }
        }
    }

    private func cell(_ fact: Fact) -> some View {
        VStack(spacing: WingtipSpace.xxs) {
            Text(fact.label).font(.footnote).foregroundStyle(.secondary)
            Text(fact.value).font(.headline.monospacedDigit()).foregroundStyle(fact.colour ?? .primary)
                .contentTransition(.numericText())
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(fact.label): \(fact.value == "—" ? "not known" : fact.spoken ?? fact.value)")
    }
}
