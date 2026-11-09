import SwiftUI

/// "Plan a Trip" in the Ask, as the web's TripPlanner: the trip in the
/// pilot's words, the tool in use while it works, then the proposal -- the
/// reason in the planner's words, each leg with its figures and its Use,
/// the constraints it could not meet said plainly, and the reports it
/// rests on. What went wrong is said in place (ProblemLine).
struct TripPlannerView: View {
    let trip: TripPlanner
    let context: () -> AssistantContext
    let onUse: (TripLeg) -> Void
    let onSource: (AssistantSource) -> Void
    let onClose: () -> Void
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: WingtipSpace.md) {
            Text("Plan a Trip").font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader)
            if !trip.asked.isEmpty {
                Text(trip.asked)
                    .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                    .background(Color.accentColor, in: .rect(cornerRadius: WingtipRadius.card))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity, alignment: .trailing)
            }
            if let status = trip.status {
                HStack(spacing: WingtipSpace.sm) {
                    ProgressView().controlSize(.small)
                    Text("\(status)…").font(.footnote).foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
            }
            if trip.proposal != nil || !trip.words.isEmpty {
                VStack(alignment: .leading, spacing: WingtipSpace.md) {
                    if !trip.words.isEmpty { Text(trip.words) }
                    ForEach(trip.proposal?.legs ?? [], id: \.kind) { leg in
                        TripLegRow(leg: leg, used: trip.used.contains(leg.kind)) { onUse(leg); trip.use(leg) }
                    }
                    ForEach(trip.proposal?.unmet ?? [], id: \.self) { Text($0).font(.footnote).foregroundStyle(WingtipInk.problem) }
                    if !trip.busy {
                        ForEach(trip.sources, id: \.id) { source in
                            Button(source.label) { onSource(source) }.glassButton().buttonBorderShape(.capsule)
                        }
                    }
                }
                .padding(WingtipSpace.md)
                .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: WingtipRadius.card))
            }
            ProblemLine(trip.problem)
            HStack(spacing: WingtipSpace.sm) {
                TextField("Describe the trip", text: $text)
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.send)
                    .onSubmit(send)
                if trip.busy {
                    Button { trip.stop() } label: { Image(systemName: "stop.circle.fill").font(.title2) }
                        .accessibilityLabel("Stop")
                } else {
                    Button(action: send) { Image(systemName: "arrow.up.circle.fill").font(.title2) }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityLabel("Plan the trip")
                }
                Button { trip.clear(); onClose() } label: { Image(systemName: "xmark.circle.fill").font(.title2) }
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Close the trip planner")
            }
        }
    }

    private func send() {
        guard !trip.busy else { return }
        trip.plan(text, context: context())
    }
}

/// One leg: its route, when it leaves and lands on this phone's clock, its
/// altitude, distance, time and fuel, all the planner's, the go window it
/// leaves in, and the planner's cautions; Use loads it.
private struct TripLegRow: View {
    let leg: TripLeg
    let used: Bool
    let onUse: () -> Void

    var body: some View {
        let route = ([leg.change.dep] + leg.change.stops + [leg.change.dest]).joined(separator: " → ")
        let clock = { (iso: String) in DepartureWindow.clock(iso) }
        let land = leg.arrive.map { ", land \(clock($0))" } ?? ""
        let window = leg.window.map { " · in the go window \(clock($0.start))–\(clock($0.last))" } ?? ""
        let figures = [leg.altitudeFt.map { Format.altitude($0) }, leg.distanceNm.map { Format.distance($0) },
                       leg.eteMin.map(Format.duration), leg.fuelGal.map { Format.fuel($0) }].compactMap { $0 }.joined(separator: " · ")
        VStack(alignment: .leading, spacing: WingtipSpace.xs) {
            Text(route).fontWeight(.semibold)
            Text("\(leg.kind == "return" ? "Back" : "Leave") \(clock(leg.change.depart))\(land)\(window)").monospacedDigit()
            if !figures.isEmpty { Text(figures).font(.footnote).foregroundStyle(.secondary).monospacedDigit() }
            ForEach(leg.cautions, id: \.self) { Text($0).font(.footnote).foregroundStyle(WingtipInk.problem) }
            if used {
                Label("Loaded", systemImage: "checkmark").font(.subheadline)
            } else {
                Button(leg.kind == "return" ? "Use return leg" : "Use this plan", action: onUse)
                    .glassProminentButton().buttonBorderShape(.capsule)
            }
        }
    }
}
