import SwiftUI

/// The Route Leg card, the one view of a leg wherever it is opened (the
/// owner's card rule, 2026-11-10): a tap on the map's course opens it as
/// a card, a nav log row pushes it in the nav log's card. As ForeFlight
/// opens one from a tap on its course (the owner's screenshot, 2026-11-08;
/// the web's RouteLegCard): the leg's ends, Active Leg on the one being
/// flown, its actions in a row -- Direct to its end in the tint, Remove in
/// the system's red -- then its Distance and its Course, magnetic, and the
/// nav log's figures for it in full (LegFigureSections).
struct RouteLegView: View {
    @Environment(InFlight.self) private var inFlight
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(DryRun.self) private var dryRun
    @Environment(Navigator.self) private var nav
    @State private var model: RouteLegModel

    init(index: Int) { _model = State(initialValue: RouteLegModel(index: index)) }

    var body: some View {
        let navLeg = model.navLeg(plan: plan)
        List {
            if let sheet = model.sheet(plan: plan, nextIndex: inFlight.progress?.next?.index) {
                Section {
                    HStack(spacing: WingtipSpace.sm) {
                        Text(sheet.from).lineLimit(1)
                        Image(systemName: "arrow.right").accessibilityLabel("to")
                        Text(sheet.to).lineLimit(1)
                        Spacer(minLength: WingtipSpace.sm)
                        // Said in the tint, as a status in words, not a capsule.
                        if sheet.active {
                            Label("Active Leg", systemImage: "airplane")
                                .font(WingtipType.label)
                                .foregroundStyle(.tint)
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
                if let navLeg { LegFigureSections(leg: navLeg) }
            } else {
                Text("The route has changed").foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Route Leg")
        // Remove taken back here as on the plan (UndoToolbarItem).
        .toolbar { UndoToolbarItem() }
    }

    @ViewBuilder
    private func actions(_ sheet: RouteLegs.Sheet) -> some View {
        if sheet.direct != nil || sheet.remove != nil {
            GlassRow {
                if let direct = sheet.direct {
                    Button { model.direct(sheet, plan: plan, from: dryRun.fix ?? ownShip.fix, nav: nav) } label: {
                        Label(direct.on ? "Cancel Direct" : "Direct \(direct.ident)", systemImage: WingtipIcon.directTo)
                            .symbolBounce(on: Feel.shared.directTo)
                            .frame(maxWidth: .infinity)
                    }
                    .glassProminentButton()
                }
                if let stop = sheet.remove {
                    Button(role: .destructive) { model.remove(sheet, plan: plan, nav: nav) } label: {
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

#Preview("RouteLegView") {
    NavigationStack { RouteLegView(index: 0) }
        .environment(Plan())
        .environment(OwnShip())
        .environment(DryRun())
}
