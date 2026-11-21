import SwiftUI

/// The fuel in the tanks at a point of FPL's timeline, right after its
/// ident, as the web's timeline draws its gauge there (the owner: "Fuel
/// should go right after airport"; "next to airport say ... fuel in
/// tanks"): the departure's at engine start, each stop's and the
/// destination's on landing, every figure the engine's (RouteTanks). The
/// system's capacity gauge of the share left and the gallons; under the
/// reserve in red with a mark beside it for a pilot who does not see the
/// colour, past empty the gallons short ("−12 gal") and the gauge empty.
/// At a field the airplane leaves it is a button that sets its fuel (the
/// owner, 2026-11-21: "can we set the fuel tank by tapping on it?").
struct TimelineGauge: View {
    let point: TimelinePoint
    let tank: TankAt
    let settable: Bool
    let setFuel: (FuelSetAsk) -> Void
    @ScaledMetric(relativeTo: .body) private var width = 36.0

    var body: some View {
        if settable {
            Button { setFuel(FuelSetAsk(ident: point.ident, stop: point.role != .departure, tank: tank)) } label: { gauge }
                .buttonStyle(.borderless)
                .hitArea()
                .accessibilityHint(point.role == .departure ? "Sets the fuel on board at engine start" : "Sets the fuel bought at \(point.ident)")
                .accessibilityIdentifier(point.role == .departure ? "fuel-set-departure" : "fuel-set-stop")
        } else {
            gauge
        }
    }

    private var gauge: some View {
        let ink: Color = tank.low ? WingtipInk.problem : .primary
        let what = point.role == .departure ? "on board" : "lands with"
        return HStack(spacing: WingtipSpace.xs) {
            if tank.low { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(ink).accessibilityHidden(true) }
            Gauge(value: min(max(tank.gal, 0), tank.usable), in: 0...max(tank.usable, 1)) { EmptyView() }
                .gaugeStyle(.accessoryLinearCapacity)
                .tint(ink)
                .frame(width: width)
                .accessibilityHidden(true)
            Text(Format.tankGallons(tank.gal))
                .font(WingtipType.detail.monospacedDigit().weight(.semibold))
                .foregroundStyle(ink)
                .lineLimit(1)
                .fixedSize()
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(what) \(Format.tankGallons(tank.gal))\(tank.own != nil ? ", your fuel" : "")\(tank.low ? ", under the reserve" : "")")
    }
}

/// The gauge tapped: which field, whether a stop's, and its tanks.
struct FuelSetAsk: Identifiable {
    let ident: String
    let stop: Bool
    let tank: TankAt
    var id: String { ident }
}

/// Setting the fuel as the airplane leaves a field (the web's FuelSet): at
/// the departure the fuel on board at engine start, Full or the gallons;
/// at a stop what the tanks are fuelled to, Full, No fuel (it keeps what
/// it lands with) or the gallons. The quick picks a segmented control
/// (discrete settings are segments), the gallons a number field. No Tabs
/// pick: no airplane profile carries a tabs figure, and none is assumed.
/// More than the tanks hold is kept with a warning (warn, never limit).
/// Cancel and Done in the bar, as a sheet's form is; Undo is the plan's.
struct FuelSetSheet: View {
    @Environment(Plan.self) private var plan
    @Environment(\.dismiss) private var dismiss
    let ask: FuelSetAsk
    @State private var pick: Pick = .full
    @State private var gallons: Int?
    @FocusState private var typing: Bool

    enum Pick: Hashable { case full, none, own }

    private var usable: Int { Int(ask.tank.usable.rounded(.down)) }
    /// What it lands with at a stop, which No fuel keeps.
    private var left: Int { max(0, Int(ask.tank.gal.rounded(.down))) }
    private var shown: Int? { pick == .full ? usable : pick == .none ? left : gallons }
    private var valid: Bool { pick != .own || (gallons ?? -1) >= 0 }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Fuel", selection: $pick) {
                        Text("Full (\(usable) gal)").tag(Pick.full)
                        if ask.stop { Text("No fuel").tag(Pick.none) }
                        Text("Gallons").tag(Pick.own)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: pick) { _, next in if next != .own { gallons = shown } }
                    TextField("Gallons", value: $gallons, format: .number)
                        .keyboardType(.numberPad)
                        .focused($typing)
                        .onChange(of: gallons) { _, typed in if typing, typed != shown { pick = .own } }
                        .accessibilityLabel("\(title), gallons")
                        .accessibilityIdentifier("fuel-set-input")
                } footer: {
                    // Warn, never limit: more than the usable fuel is the pilot's word.
                    if let shown, shown > usable {
                        Text("More than the \(usable) gal the tanks hold").foregroundStyle(WingtipInk.problem)
                    } else if ask.stop {
                        Text("Lands with \(Format.tankGallons(ask.tank.gal))")
                    } else {
                        Text("The fuel in the tanks at engine start: full, or the gallons.")
                    }
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel", role: .cancel) { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        plan.setTanks(ask.ident, gallons: pick == .full ? nil : pick == .none ? 0 : gallons)
                        dismiss()
                    }
                    .disabled(!valid)
                    .accessibilityIdentifier("fuel-set-done")
                }
            }
        }
        .onAppear {
            let own = ask.tank.own
            pick = own == nil ? .full : ask.stop && own == 0 ? .none : .own
            gallons = own ?? usable
        }
    }

    private var title: String { ask.stop ? "Fuel at \(ask.ident)" : "Fuel on Board at \(ask.ident)" }
}

/// Add a Stop's neighbour, as the web's fuel stops pill ends that row:
/// "Add Fuel Stops" where the planner suggests stops for a flight too long
/// for the tanks, putting in every flight's in one step (Plan.addFuelStops,
/// the planner's answer already checked round by round), and once the
/// route has the ones it put in, "Remove Fuel Stops", in red as a removal
/// is. Where a flight is short and no stop is offered, why, in the
/// problem's ink in their place (warn, never limit). Nothing where there
/// is none of these.
struct FuelStopsButton: View {
    @Environment(Plan.self) private var plan

    var body: some View {
        if !plan.fuelStopsIn.isEmpty {
            Button(role: .destructive) { plan.removeFuelStops() } label: {
                Label("Remove Fuel Stops", systemImage: "fuelpump.slash")
            }
            .accessibilityIdentifier("fuel-stops-remove")
        } else if let next = plan.fuelStopsToAdd {
            Button { plan.addFuelStops() } label: { Label("Add Fuel Stops", systemImage: "fuelpump") }
                .accessibilityHint("Puts in \(next.added.joined(separator: ", "))")
                .accessibilityIdentifier("fuel-stops-add")
        } else if let why = plan.noFuelStop {
            Label(why, systemImage: "fuelpump.exclamationmark")
                .font(WingtipType.note)
                .foregroundStyle(WingtipInk.problem)
                .accessibilityIdentifier("no-fuel-stop")
        }
    }
}
