import SwiftUI

/// The Brief's passenger briefing (#223): what to tell the passengers,
/// each with its source under it, ticked off for this flight; then the
/// flight in a few lines, to send them (PassengerBriefing). Its state is
/// the model's (PassengerBriefingModel).
struct PassengerBriefingView: View {
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @State private var model: PassengerBriefingModel

    init(flight: String) {
        _model = State(initialValue: PassengerBriefingModel(flight: flight))
    }

    private var message: String {
        let metar = plan.briefing?.metars.additionalProperties[plan.dest] ?? nil
        return PassengerBriefing.message(
            dep: plan.dep, depName: plan.course?.departure.name, dest: plan.dest, destName: plan.course?.destination.name,
            departs: model.departs, eteMin: plan.totals?.eteMin, weather: PassengerBriefing.weather(metar))
    }

    var body: some View {
        List {
            Section {
                ProblemLine(PassengerBriefing.asked, "The briefing's items")
                ForEach(PassengerBriefing.items) { item in
                    let on = model.isTicked(item.key)
                    Button {
                        model.toggle(item.key)
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? accent : Color.secondary).symbolSwap()
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text(item.title).foregroundStyle(.primary)
                                Text(item.source).font(.footnote).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            } header: {
                HStack {
                    Text("Brief Them")
                    Spacer()
                    Text("\(model.done) of \(PassengerBriefing.items.count)").monospacedDigit()
                }
            }
            Section("The Flight") {
                DatePicker("Leaving", selection: $model.departs)
                Text(message).font(.callout).textSelection(.enabled)
                ShareLink(item: message, subject: Text("Our flight"), preview: SharePreview("Our flight")) {
                    Label("Send to Your Passengers", systemImage: "square.and.arrow.up")
                }
            }
        }
        .navigationTitle("Passengers")
    }
}

#Preview("PassengerBriefingView") {
    NavigationStack { PassengerBriefingView(flight: "KDLH-KPWK|2026-11-08") }
        .environment(Plan())
}
