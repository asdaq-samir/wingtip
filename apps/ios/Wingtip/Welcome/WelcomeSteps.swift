import SwiftUI

/// The welcome's airplane: No Airplane, the default (docs/decisions/0011),
/// the pilot's own where signed in, or any N-number, flown as the
/// Airplane tab flies one (Plan.fly).
struct WelcomeAirplaneStep: View {
    @Bindable var model: WelcomeModel
    let done: () -> Void
    @Environment(Plan.self) private var plan
    @Environment(Session.self) private var session

    private var none: Bool { !plan.airplaneChosen && plan.tail == nil }

    var body: some View {
        WelcomePage(symbol: "airplane", title: "Your Airplane",
                    sentence: "Pick the airplane you fly for its time and fuel, or none for the distance and courses alone.") {
            VStack(spacing: WingtipSpace.sm) {
                WelcomeChoice(title: "No Airplane", detail: nil, picked: none) { model.flyNoAirplane(plan) }
                ForEach(model.own) { airplane in
                    WelcomeChoice(title: airplane.tailNumber, detail: airplane.typeDesignator, picked: plan.tail == airplane.tailNumber) {
                        Task { await model.fly(airplane.tailNumber, plan: plan) }
                    }
                }
                HStack(spacing: WingtipSpace.sm) {
                    TextField("N-number", text: $model.typedTail)
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                        .font(WingtipType.row.monospaced())
                        .textFieldStyle(.roundedBorder)
                        .onSubmit { Task { await model.fly(model.typedTail, plan: plan) } }
                    Button("Fly") { Task { await model.fly(model.typedTail, plan: plan) } }
                        .buttonStyle(.bordered)
                        .disabled((try? Registered.isNNumber(model.typedTail.uppercased())) != true)
                }
                if let tail = plan.tail, !model.own.contains(where: { $0.tailNumber == tail }) {
                    WelcomeChoice(title: tail, detail: plan.airplaneChosen ? plan.aircraft.uppercased() : nil, picked: true) {}
                }
            }
            .padding(.top, WingtipSpace.sm)
        } actions: {
            Button(action: done) { Text("Continue").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
        .task(id: session.signedIn) { await model.loadOwn(signedIn: session.signedIn) }
    }
}

/// The welcome's home airport, optional: found by ident or name with the
/// planner's search, the Airport tab's.
struct WelcomeHomeStep: View {
    @Bindable var model: WelcomeModel
    let done: () -> Void

    var body: some View {
        WelcomePage(symbol: "house", title: "Home Airport",
                    sentence: "Where you fly from most. A route typed with one airport starts here when your position isn't known.") {
            VStack(spacing: WingtipSpace.sm) {
                if let home = model.home {
                    WelcomeChoice(title: home, detail: nil, picked: true) {}
                    Button("No Home Airport", role: .destructive) { model.pickHome(nil) }
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                TextField(AirportQuery.prompt, text: $model.homeQuery)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                    .submitLabel(.search)
                ForEach(model.homeFound) { field in
                    WelcomeChoice(title: field.ident,
                                  detail: [field.name, field.municipality].compactMap { $0 }.joined(separator: " · "),
                                  picked: false) { model.pickHome(field.ident) }
                }
                if let problem = model.homeProblem { ProblemLine(problem) }
            }
            .padding(.top, WingtipSpace.sm)
            .task(id: model.homeQuery) { await model.findHome() }
        } actions: {
            Button(action: done) { Text(model.home == nil ? "Not Now" : "Continue").frame(maxWidth: .infinity) }
                .buttonStyle(.borderedProminent).controlSize(.large)
        }
    }
}

/// One choice on a welcome page: a full-width row, its title and detail,
/// a checkmark in the tint where picked; 44 points tall at least.
struct WelcomeChoice: View {
    let title: String
    let detail: String?
    let picked: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(WingtipType.title)
                    if let detail, !detail.isEmpty { Text(detail).font(WingtipType.detail).foregroundStyle(.secondary) }
                }
                Spacer()
                if picked { Image(systemName: "checkmark").foregroundStyle(.tint).accessibilityHidden(true) }
            }
            .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
            .frame(maxWidth: .infinity, minHeight: WingtipSize.tapTarget, alignment: .leading)
            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: WingtipRadius.base))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked ? .isSelected : [])
    }
}
