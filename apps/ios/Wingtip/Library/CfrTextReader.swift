import SwiftUI

/// A CFR part read as text in the app's own type, as the web's TextBody
/// reads it: each subpart a section of the list, each section's heading
/// and its paragraphs, opened at a cite's section. With words in the
/// reader's search, every place they are found is listed instead, each
/// a tap to its section (ReaderFinding.search).
struct CfrTextReader: View {
    let text: CfrText
    let start: String?
    let query: String
    @State private var target: String?

    var body: some View {
        let hits = ReaderFinding.search(text, query)
        ScrollViewReader { reader in
            List {
                if query.trimmingCharacters(in: .whitespaces).count >= 2 {
                    Section {
                        if hits.isEmpty { Text("Not found").foregroundStyle(.secondary) }
                        ForEach(hits) { hit in
                            Button {
                                target = hit.section
                            } label: {
                                VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                    Text("§ \(hit.section)").font(.subheadline.weight(.semibold))
                                    Text("\(hit.before)\(Text(hit.match).bold().foregroundStyle(.tint))\(hit.after)")
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                            }
                            .foregroundStyle(.primary)
                        }
                    } header: {
                        Text(hits.count >= ReaderFinding.mostHits ? "The first \(hits.count) found" : "\(hits.count) found")
                    }
                    .accessibilityIdentifier("reader-text-hits")
                }
                Section { Text(text.head).font(.title3.weight(.semibold)) }
                ForEach(Array(text.groups.enumerated()), id: \.offset) { _, group in
                    Section(group.head) {
                        ForEach(group.sections, id: \.id) { section in
                            VStack(alignment: .leading, spacing: WingtipSpace.sm) {
                                Text(section.head).font(.headline)
                                ForEach(Array(section.paragraphs.enumerated()), id: \.offset) { _, paragraph in
                                    Text(paragraph).textSelection(.enabled)
                                }
                            }
                            .id(section.id)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .onAppear { if let start { reader.scrollTo(start, anchor: .top) } }
            .onChange(of: target) { _, id in
                guard let id else { return }
                withAnimation { reader.scrollTo(id, anchor: .top) }
                target = nil
            }
        }
        .accessibilityIdentifier("reader-text")
    }
}
