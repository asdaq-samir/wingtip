import SwiftUI

/// Aircraft: the airplane by its N-number, the owner's rule ("airplane
/// should only be picked by n-number"): one of the pilot's own, with the
/// figures they set, or any N-number typed, looked up in the FAA's
/// registry for its type and flown on the planner's figures for it. The
/// types the planner has figures for are listed under them. A page of the
/// sheet's stack: the route box's Airplane, the one search's types and
/// Settings open it.
struct AircraftView: View {
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session
    @Environment(Navigator.self) private var nav
    @State private var model = AirplanePickModel()
    @State private var typed = ""
    /// Why what was typed could not be flown, said under the field.
    @State private var tailProblem: String?
    /// The FAA record of the N-number typed, for its suggestion's line.
    @State private var registered: AircraftRegistration?
    private var profiles: [AircraftProfile] { model.profiles }
    private var own: [OwnAircraftRecord] { model.own }

    var body: some View {
        List {
            // The airplane by the one search (the owner, 2026-11-14: the
            // airplanes' Adds ask it, "Search for your airplane"), which
            // finds the pilot's own, any N-number and those heard.
            Section {
                Button { nav.searchAirplane(.yours) } label: { Label("Search for Your Airplane", systemImage: "magnifyingglass") }
                    .accessibilityIdentifier("airplane-search")
            }
            Section("Airplane") {
                HStack {
                    TextField("N-number", text: $typed)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                        .font(.body.monospaced())
                        .onSubmit(fly)
                    // The system's prominent button, never dimmed: what is not
                    // an N-number is said under the field when Fly is tapped
                    // (warn, never limit; lib/problems' where it happens).
                    Button("Fly") { fly() }
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                }
                ProblemLine(tailProblem)
                // Suggestions as it is typed, the one search's own rows
                // (AirplaneHits; the owner's S1, 2026-11-14): a tap flies it.
                AircraftFieldSuggestions(typed: typed, own: own, profiles: profiles, registered: registered) { tail in
                    typed = tail
                    fly()
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
                Section("Yours") {
                    ProblemLine(model.ownProblem)
                    ForEach(own) { airplane in
                        HStack {
                            Button {
                                typed = airplane.tailNumber
                                fly()
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
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
                    NavigationLink("Your Airplanes") { OwnAircraftListView() }
                }
            }
            Section("Types the Planner Has Figures for") {
                if profiles.isEmpty {
                    if let problem = model.problem {
                        ProblemLine(problem)
                    } else {
                        ForEach(0..<3, id: \.self) { _ in
                            VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                                Text("Airplane type").font(.headline)
                                Text("Cruise speed · fuel burn · ceiling").font(.subheadline).foregroundStyle(.secondary)
                            }
                            .loading("Fetching the types")
                        }
                    }
                }
                ForEach(profiles, id: \.name) { profile in
                    HStack {
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
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
        // The typed N-number's FAA record, once the typing stops (the
        // registry alone, at once: /api/traffic/registered).
        .task(id: typed) {
            registered = nil
            guard let tail = AirplaneHits.typedTail(typed, own: own) else { return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            registered = (try? await Planner.registered(tail)) ?? nil
        }
        .navigationTitle("Airplane")
        .task { await model.loadProfiles() }
        .task(id: session.signedIn) { await model.loadOwn(signedIn: session.signedIn) }
        // Back from Your Airplanes with one added or changed.
        .onAppear { Task { await model.loadOwn(signedIn: session.signedIn) } }
    }

    private func fly() {
        let tail = typed.uppercased().trimmingCharacters(in: .whitespaces)
        // Flown only as an N-number the engine has read as one; else why not.
        guard (try? Registered.isNNumber(tail)) == true else {
            tailProblem = tail.isEmpty ? "Type the airplane's N-number." : "\(tail) isn't an N-number."
            return
        }
        tailProblem = nil
        Task { await plan.fly(tail: tail, own: own, profiles: profiles) }
    }
}

#Preview("AircraftView") {
    let plan = Plan()
    plan.tail = "N3429J"
    return NavigationStack { AircraftView() }
        .environment(plan)
        .environment(Session())
}

/// The FPL airplane field's suggestions under it, from the one search's
/// rows (AirplaneHits): the pilot's own that match, the N-number typed with
/// its FAA record once it is a whole one, and the planner's types; nothing
/// with nothing typed.
private struct AircraftFieldSuggestions: View {
    let typed: String
    let own: [OwnAircraftRecord]
    let profiles: [AircraftProfile]
    let registered: AircraftRegistration?
    let pick: (String) -> Void

    var body: some View {
        let query = typed.trimmingCharacters(in: .whitespaces)
        let mine = AirplaneHits.own(query, in: own)
        let tail = AirplaneHits.typedTail(query, own: own)
        ForEach(mine, id: \.tailNumber) { airplane in
            Button { pick(airplane.tailNumber) } label: {
                SearchRowLabel(title: airplane.tailNumber, detail: airplane.typeDesignator, systemImage: WingtipIcon.airplane)
            }
            .foregroundStyle(.primary)
        }
        if let tail {
            Button { pick(tail) } label: {
                SearchRowLabel(title: tail, detail: registered.map(AirplaneHits.registryLine) ?? "FAA registry", systemImage: WingtipIcon.airplane)
            }
            .foregroundStyle(.primary)
            .accessibilityHint("Flies it")
        }
    }
}
