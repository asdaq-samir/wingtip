import SwiftUI

/// Aircraft: the airplane by its N-number, the owner's rule ("airplane
/// should only be picked by n-number"): one of the pilot's own, with the
/// figures they set, or any N-number typed, looked up in the FAA's
/// registry for its type and flown on the planner's figures for it. The
/// types the planner has figures for are listed under them.
struct AircraftView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @State private var profiles: [AircraftProfile] = []
    @State private var own: [OwnAircraftRecord] = []
    @State private var typed = ""
    @State private var problem: String?

    var body: some View {
        NavigationStack {
            List {
                // Any airplane in the air, by its callsign, N-number or
                // address: its card, tracked on the map.
                Section {
                    NavigationLink { TrafficFindView().closesBack() } label: { Label("Find an Airplane", systemImage: "magnifyingglass") }
                }
                Section(title: "Airplane") {
                    HStack {
                        TextField("N-number", text: $typed)
                            .textInputAutocapitalization(.characters).autocorrectionDisabled()
                            .font(.body.monospaced())
                            .onSubmit(fly)
                        Button("Fly") { fly() }
                            .buttonStyle(ProminentButtonStyle())
                            .disabled((try? Registered.isNNumber(typed.uppercased())) != true)
                    }
                    // No airplane: the route's own figures alone, none
                    // assumed (docs/decisions/0011); the plan's start.
                    Button { plan.flyNoAirplane() } label: {
                        HStack {
                            Text("No Airplane")
                            Spacer()
                            if !plan.airplaneChosen && plan.tail == nil {
                                Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityLabel("Flying now")
                            }
                        }
                    }
                    .foregroundStyle(.primary)
                    if let tail = plan.tail {
                        LabeledContent("Flying") {
                            // The N-number opens its profile (the owner, 2026-11-09).
                            TailButton(tail: tail) {
                                Text(plan.aircraft == Plan.ownAirplane ? "\(tail), on your figures" : "\(tail) on \(plan.aircraft.uppercased())")
                            }
                        }
                        // Every figure the planner flies it on, each with its
                        // source, the pilot's to set (AirplaneProfileView).
                        TailButton(tail: tail) { Text("Figures") }
                    }
                    // The airplane's checklists, normal and emergency, kept on
                    // this device by its N-number, else by its type.
                    ChecklistRows(airplane: LocalChecklists.airplane(of: plan))
                }
                if session.signedIn || !own.isEmpty {
                    Section(title: "Yours") {
                        ForEach(own) { airplane in
                            HStack {
                                Button {
                                    typed = airplane.tailNumber
                                    fly()
                                } label: {
                                    HStack {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(airplane.tailNumber).font(.headline.monospaced())
                                            Text("\(airplane.typeDesignator) · \(Format.speed(airplane.cruiseTasKt)) · \(Format.number(airplane.fuelBurnGph, decimals: 1)) gal/h")
                                                .font(.footnote).foregroundStyle(.secondary)
                                        }
                                        Spacer()
                                        if plan.tail == airplane.tailNumber { Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityLabel("Flying now") }
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.borderless)
                                .foregroundStyle(.primary)
                                // Its profile, a tap apart from flying it, as
                                // a list's detail button is.
                                TailButton(tail: airplane.tailNumber) {
                                    Image(systemName: "info.circle").accessibilityLabel("\(airplane.tailNumber) profile")
                                }
                            }
                        }
                        // Added, edited and deleted on their own page, with
                        // each one's checklist, squawks and inspections.
                        NavigationLink("Your Airplanes") { OwnAircraftListView().closesBack() }
                    }
                }
                Section(title: "Types the Planner Has Figures for") {
                    if profiles.isEmpty {
                        if let problem { ProblemLine(problem) } else { Skeleton(label: "Fetching the types") }
                    }
                    ForEach(profiles, id: \.name) { profile in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(profile.type ?? profile.designator ?? profile.name.uppercased()).font(.headline)
                                Text("\(Format.speed(profile.cruiseTasKt)) · \(Format.number(profile.fuelBurnGph, decimals: 1)) gal/h · ceiling \(Format.altitude(profile.serviceCeilingFt))"
                                    + (profile.usableFuelGal.map { " · \(Format.fuel($0, decimals: 0)) usable" } ?? ""))
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if profile.name == plan.aircraft { Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityLabel("Flying now") }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            .navigationTitle("Airplane")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                do { profiles = try await Planner.aircraftProfiles() } catch { problem = error.localizedDescription }
            }
            .task(id: session.signedIn) {
                own = (try? await Gateway.aircraftRecords()) ?? []
            }
            // Back from Your Airplanes with one added or changed.
            .onAppear { Task { own = (try? await Gateway.aircraftRecords()) ?? [] } }
        }
    }

    private func fly() {
        let tail = typed.uppercased().trimmingCharacters(in: .whitespaces)
        // Fly is only enabled for an N-number the engine has read as one.
        guard (try? Registered.isNNumber(tail)) == true else { return }
        Task { await plan.fly(tail: tail, own: own, profiles: profiles) }
    }
}

#Preview("AircraftView") {
    let plan = Plan()
    plan.tail = "N3429J"
    return AircraftView()
        .environment(plan)
        .environment(Session())
}
