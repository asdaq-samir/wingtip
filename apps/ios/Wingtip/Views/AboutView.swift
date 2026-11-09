import SwiftUI

/// About, as Settings > General > About has it: the app and its build, the
/// editions of the FAA data in use, what the app is and is not (the
/// planning aid's words, the same in every app), whose data and software
/// it is made with, the site's legal pages, and the demo flight for a
/// pilot or App Review trying it. Reached from Setup's last section.
struct AboutView: View {
    @Environment(Charts.self) private var charts
    @Environment(Plan.self) private var plan
    @Environment(\.dismiss) private var dismiss
    @State private var model = AboutModel()

    var body: some View {
        List {
            Section {
                VStack(spacing: WingtipSpace.sm) {
                    WingtipMark().frame(width: 64, height: 64)
                    Text("Wingtip Maps").font(.title2.weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
                .accessibilityElement(children: .combine)
            }
            Section {
                LabeledContent("Version", value: model.version.short)
                LabeledContent("Build", value: model.version.build)
                if let edition = charts.info?.chartCycle { LabeledContent("Chart Edition", value: edition) }
                if let cycle = model.packCycle { LabeledContent("Data Cycle", value: cycle) }
            }
            Section(title: "A Planning Aid") {
                Text(PlanningAid.words)
            }
            Section(title: "Credits") {
                ForEach(AboutCredits.data + AboutCredits.software, id: \.self) { credit in
                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                        Text(credit.what)
                        Text(credit.terms).font(.footnote).foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            Section(title: "Legal") {
                Link("Privacy Policy", destination: AboutModel.page("privacy"))
                Link("Terms of Use", destination: AboutModel.page("terms"))
                Link("Support", destination: AboutModel.page("support"))
            }
            // The flight planned and the map shown with the FPL tab up; the
            // route the pilot had is one Undo away (PlanHistory).
            Section {
                Button {
                    DemoFlight.fly(plan)
                    dismiss()
                } label: {
                    HStack {
                        Text("Demo Flight").foregroundStyle(.tint)
                        Spacer()
                        Text("\(DemoFlight.departure) to \(DemoFlight.destination), C172").foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("About")
        .task { model.load() }
    }
}

#Preview("AboutView") {
    NavigationStack { AboutView() }
        .environment(Charts())
        .environment(Plan())
}
