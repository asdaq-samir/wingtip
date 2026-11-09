import SwiftUI

/// A section's title as the app writes every one: 20 points, semibold,
/// Title Case as given, in the text colour (docs/decisions/0021; the
/// owner's "section titles 20 pt"). The UI audit of 2026-11-09 (item 14)
/// found 111 of 113 sections headed in the system's small grey capitals.
/// `Section("Words")` is written `Section { … } header: { SectionTitle("Words") }`,
/// or with the `Section(title:)` shorthand below.
struct SectionTitle: View {
    let text: String

    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(WingtipType.heading)
            .foregroundStyle(Color(uiColor: .label))
            .textCase(nil)
            .accessibilityAddTraits(.isHeader)
    }
}

extension Section where Parent == SectionTitle, Footer == EmptyView, Content: View {
    /// A section headed by its SectionTitle.
    init(title: String, @ViewBuilder content: () -> Content) {
        self.init(content: content, header: { SectionTitle(title) })
    }
}
