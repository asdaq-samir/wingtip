import SwiftUI

/// Where the one search's picks go, the host's to say: the plan's sheet
/// pushes pages on its stack (PlanSheet), the strip on its own.
@MainActor
struct SearchHost {
    /// A field's or a point's card, or a list of fields, as AirportRoute
    /// writes it.
    var card: (String) -> Void
    /// The plan in sight: the sheet's root.
    var showPlan: () -> Void
    /// Settings (the account button's), or the Airplane page for a type.
    var page: (SheetPage) -> Void
    /// A screen by its name (a Do row).
    var screen: (Screen) -> Void
    /// A screen by the word typed or said (FieldCommands); why not where
    /// it cannot open yet.
    var field: (FieldScreen) -> String?
    /// The question for the assistant.
    var ask: (String) -> Void
}

extension View {
    /// The one search on this screen of a NavigationStack (the owner's
    /// one-search design, 2026-11-09): the system's search field in the
    /// bar, "Search airports and airplanes", its suggestions grouped
    /// in the system's list under it, the microphone and the account
    /// button beside it. The iPhone's sheet, its strip and the iPad's
    /// sidebar all put it here, so there is one search.
    /// `oneRow`: the field is the bar itself, no title row above it (the
    /// plan's sheet on the iPhone, the owner's one-row header).
    func oneSearch(_ model: OneSearchModel, host: SearchHost, oneRow: Bool = false) -> some View {
        modifier(OneSearch(model: model, host: host, oneRow: oneRow))
    }
}

/// The one search, stock throughout: `.searchable` in the stack's
/// navigation bar drawer, always shown, with `.searchSuggestions`, as
/// iOS 18 to 27 draw them (SwiftUI's SearchFieldPlacement and
/// searchSuggestions, unchanged in the iOS 27.2 SDK).
struct OneSearch: ViewModifier {
    @Environment(Navigator.self) private var nav
    @Bindable var model: OneSearchModel
    let host: SearchHost
    /// The owner's one-row header (2026-11-10): the field in the bar's
    /// principal place, the title row dropped, the account beside it, as
    /// Apple Maps' search row; else in the bar's drawer under the title.
    var oneRow = false
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @Environment(Session.self) private var session
    @Environment(VoiceInput.self) private var voice
    @Environment(Airplanes.self) private var airplanes
    @Environment(Tracking.self) private var tracking
    @Environment(Traffic.self) private var traffic

    private var runner: FieldRunner {
        FieldRunner(plan: plan, ownShip: ownShip, session: session, open: host.field,
                    card: { host.card($0) }, ask: { host.ask($0) }, showPlan: { host.showPlan() })
    }

    func body(content: Content) -> some View {
        content
            .searchable(text: $model.text, isPresented: $model.presented,
                        placement: oneRow ? .toolbarPrincipal : .navigationBarDrawer(displayMode: .always),
                        prompt: Text(voice.listening ? OneSearchModel.speak : model.askingDestination ? OneSearchModel.whereTo
                            : model.keeping?.prompt ?? OneSearchModel.prompt))
            .searchSuggestions {
                if let problem = model.problem {
                    Section { ProblemLine(problem) }
                }
                SearchSuggestions(model: model, pick: pick)
            }
            // Idents, names, N-numbers and questions alike: nothing
            // corrected or capitalised for the pilot (FieldCommands reads
            // three letters in capitals as a field, small as a word).
            .autocorrectionDisabled()
            .onSubmit(of: .search) { Task { await send(model.text) } }
            .onChange(of: model.text) { _, _ in model.problem = nil; model.typed() }
            // A question may be typed here: Apple's model is made ready as
            // the field takes focus, not when it is sent.
            .onChange(of: model.presented) { _, on in if on { AskRouter.prewarm() } }
            .toolbar {
                SearchBarItems(model: model, hear: voice.canListen ? { Task { await hear() } } : nil, open: host.page, undo: !oneRow)
            }
            .task { await model.loadTypes() }
            // The nearest fields from where the airplane is, asked again
            // once it has moved a mile.
            .task(id: ownShip.fix.map { "\(($0.coordinate.latitude * 60).rounded()),\(($0.coordinate.longitude * 60).rounded())" }) {
                await model.findNearest(ownShip.fix)
            }
    }

    private func pick(_ picked: SearchPick) {
        // An Add's search: the airplane picked is kept, not opened.
        if let keeping = model.keeping, keep(picked, keeping) {
            model.close()
            return
        }
        model.close()
        switch picked {
        case .heard(let plane):
            tracking.track(plane.hex, plane: plane)
            nav.open(.traffic(plane.hex.lowercased()))
        case .kept(let kept):
            tracking.track(kept.hex)
            nav.open(.traffic(kept.hex))
        case .airport(let route): host.card(route)
        case .plan: host.showPlan()
        case .directTo(let ident): runner.directTo(ident)
        case .airplane(let tail): nav.open(.tail(ProfileAsk(tail: tail.uppercased())))
        case .types: host.page(.screen(.airplane))
        case .action(let action):
            switch action {
            case .route(let dep, let stops, let dest):
                Task { if let why = await runner.route(dep: dep, stops: stops, dest: dest) { model.problem = why; model.presented = true } }
            case .directTo(let ident): runner.directTo(ident)
            case .open(let screen): host.screen(screen)
            case .ask(let words): host.ask(words)
            // The traffic turned on, on the map (the web's Show Traffic).
            case .showTraffic: traffic.on = true
            }
        }
    }

    /// The airplane picked for an Add (the web's pickAirplane): flown as
    /// the pilot's, by its N-number; or kept in the Favorites, a registry
    /// or own N-number by the FAA record's address. False where the pick
    /// is not an airplane that can be kept so, which then opens as usual.
    private func keep(_ picked: SearchPick, _ keeping: OneSearchModel.Keeping) -> Bool {
        let registered = model.registered
        switch (picked, keeping) {
        case (.airplane(let tail), .yours):
            fly(tail)
        case (.heard(let plane), .yours):
            guard let tail = plane.registration, isNNumber(tail) else { return false }
            fly(tail)
        case (.kept(let kept), .yours):
            guard isNNumber(kept.name) else { return false }
            fly(kept.name)
        case (.airplane(let tail), .favorite):
            Task {
                let record = registered?.nNumber == tail ? registered : (try? await Planner.registered(tail)) ?? nil
                guard let hex = record?.modeSHex?.lowercased(), !tracking.isFavorite(hex) else { return }
                tracking.toggleFavorite(KeptAirplane(hex: hex, name: tail, type: record?.model))
            }
        case (.heard(let plane), .favorite):
            if !tracking.isFavorite(plane.hex) {
                tracking.toggleFavorite(KeptAirplane(hex: plane.hex.lowercased(), name: KeptAirplane.name(plane), type: plane.type))
            }
        case (.kept(let kept), .favorite):
            if !tracking.isFavorite(kept.hex) { tracking.toggleFavorite(kept) }
        default:
            return false
        }
        return true
    }

    private func fly(_ tail: String) {
        Task {
            await plan.fly(tail: tail, own: airplanes.records, names: Array(airplanes.books.keys))
            host.showPlan()
        }
    }

    /// The line sent: done, the search put away; else why not, under the
    /// field where it was typed.
    private func send(_ line: String) async {
        guard !model.busy, !line.trimmingCharacters(in: .whitespaces).isEmpty else { return }
        model.busy = true
        defer { model.busy = false }
        if let why = await runner.run(line) {
            model.problem = why
        } else {
            model.close()
        }
    }

    /// One line said: the route's idents given the recognizer as words to
    /// listen for, so "KMSN" is not "Kay Em Ess En"; the words appearing
    /// in the field as they are said, then done as typed.
    private func hear() async {
        model.problem = nil
        model.text = ""
        model.presented = true
        let said = await voice.hear(words: plan.idents.filter { !$0.isEmpty }) { model.text = $0 }
        guard let said, !said.isEmpty else {
            model.presented = true
            model.problem = voice.problem ?? "Nothing was heard."
            return
        }
        model.text = said
        model.presented = true
        await send(said)
    }
}
