import SwiftUI

/// One of the Brief's lines for the route's borders, as the planner writes
/// them on its course (/api/course's `outside` and `adiz`, the web's glance
/// lines): leaving the United States (14 CFR 91.703, 99.15's report) or
/// meeting an Air Defense Identification Zone (14 CFR part 99). A caution
/// among the glance's lines: the finding and what to do in one line,
/// opening to what is asked, why, and the rule cited, a tap to its
/// paragraph. Warn, never limit. Nothing where the planner has no line.
struct BorderLineRow: View {
    let line: APIBorderLine
    @State private var isExpanded = false

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                Text(line.action).font(.subheadline)
                CitedText(line.why).font(.footnote).foregroundStyle(.secondary)
                CitedText(line.cite).font(.footnote).foregroundStyle(.secondary)
            }
        } label: {
            Label {
                Text(line.line)
            } icon: {
                Image(systemName: FindingStyle.symbol("caution")).foregroundStyle(FindingStyle.colour("caution"))
                    .accessibilityLabel(FindingStyle.word("caution"))
            }
            .accessibilityElement(children: .combine)
        }
    }
}
