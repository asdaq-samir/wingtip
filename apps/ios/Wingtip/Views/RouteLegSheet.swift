import SwiftUI

/// The Route Leg sheet, as ForeFlight opens one from a tap on its course
/// (the owner's screenshot, 2026-11-08; the web's RouteLegCard): the
/// leg's ends, Active Leg on the one being flown, its actions in a row --
/// Direct to its end in the tint, Remove in the system's red -- then its
/// Distance and its Course, magnetic. Its title on top and the close at
/// the right, which goes back to the map (docs/decisions/0015).
struct RouteLegSheet: View {
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @State private var model: RouteLegModel

    init(index: Int) { _model = State(initialValue: RouteLegModel(index: index)) }

    var body: some View {
        NavigationStack {
            List {
                if let sheet = model.sheet(plan: plan, nextIndex: InFlight.shared.progress?.next?.index) {
                    Section {
                        HStack(spacing: WingtipSpace.sm) {
                            Text(sheet.from).lineLimit(1)
                            Image(systemName: "arrow.right").accessibilityLabel("to")
                            Text(sheet.to).lineLimit(1)
                            Spacer(minLength: WingtipSpace.sm)
                            if sheet.active {
                                Text("Active Leg").font(WingtipType.label)
                                    .padding(.horizontal, WingtipSpace.sm).padding(.vertical, WingtipSpace.xs)
                                    .background(Color(uiColor: .secondarySystemFill), in: Capsule())
                            }
                        }
                        .font(WingtipType.title)
                        .foregroundStyle(.secondary)
                        actions(sheet)
                    }
                    Section {
                        LabeledContent("Distance", value: Format.distance(sheet.distanceNm))
                            .accessibilityValue(sheet.distanceNm.map(SpokenFigures.nauticalMiles) ?? "not known")
                        LabeledContent("Course", value: RouteLegs.courseWords(sheet.courseMagDeg))
                            .accessibilityValue(sheet.courseMagDeg.map { "\(SpokenFigures.degrees($0)) magnetic" } ?? "not known")
                    }
                } else {
                    Text("The route has changed").foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Route Leg")
            .navigationBarTitleDisplayMode(.inline)
            .closeButton { FlightUI.shared.card = nil }
        }
    }

    @ViewBuilder
    private func actions(_ sheet: RouteLegs.Sheet) -> some View {
        if sheet.direct != nil || sheet.remove != nil {
            GlassRow {
                if let direct = sheet.direct {
                    Button { model.direct(sheet, plan: plan, from: dryRun.fix ?? ownShip.fix) } label: {
                        Label(direct.on ? "Cancel Direct" : "Direct \(direct.ident)", systemImage: WingtipIcon.directTo)
                            .frame(maxWidth: .infinity)
                    }
                    .glassProminentButton()
                }
                if let stop = sheet.remove {
                    Button(role: .destructive) { model.remove(sheet, plan: plan) } label: {
                        Label("Remove \(stop)", systemImage: "trash").frame(maxWidth: .infinity)
                    }
                    .glassButton()
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: WingtipSpace.xs, leading: 0, bottom: WingtipSpace.xs, trailing: 0))
        }
    }
}

#Preview("RouteLegSheet") {
    RouteLegSheet(index: 0)
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
