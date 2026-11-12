import SwiftUI

/// The guide (the web app's PilotGuide), the parts that are words: what
/// the checkpoints' colours mean, the drills, lost communications and how
/// the nav log flies the airplane; and the holding entries, which the
/// planner works out (GET /api/holding).
struct PilotGuideView: View {
    /// Show First Flight Again tapped: said, and not tapped twice.
    @State private var askedFirstFlight = false
    // The checkpoints' bands, as CheckpointAnnotation colours them.
    private static let buckets: [(score: Double, words: String)] = [
        (4.5, "4.5 and up: you will see it and know it"),
        (4.0, "4 to 4.5: you should spot it without hunting"),
        (3.5, "3.5 to 4: findable, but easy to confuse with something nearby"),
        (3.0, "3 to 3.5: weak; keep a second reference"),
        (0, "below 3: not one to plan on"),
    ]

    var body: some View {
        List {
            // The first flight's card offered again (FirstFlightModel), at
            // the guide's top as the web's Guide has it (TipsGroup): Setup's
            // one home for it.
            Section {
                Button {
                    FirstFlightModel.shared.again()
                    askedFirstFlight = true
                } label: {
                    SettingsLabel(askedFirstFlight ? "First Flight Will Show Again" : "Show First Flight Again",
                                  systemImage: "lightbulb", colour: WingtipColor.Badge.rule)
                }
                .disabled(askedFirstFlight)
                .accessibilityIdentifier("first-flight-again")
            }
            Section("Checkpoint Colours") {
                ForEach(Self.buckets, id: \.score) { b in
                    Label {
                        Text(b.words)
                    } icon: {
                        // The band's colour beside its words, which say it.
                        Circle().fill(Color(uiColor: CheckpointAnnotation.colour(for: b.score))).frame(width: 12, height: 12)
                            .accessibilityHidden(true)
                    }
                }
            }
            Section("Practice") { PracticeRows() }
            Section("More") {
                NavigationLink("Your airplane in the day's air") { AirplaneInTheAirView() }
            }
        }
        .navigationTitle("Guide")
    }
}

/// How the nav log flies the pilot's figures, in the web app's words.
struct AirplaneInTheAirView: View {
    var body: some View {
        ScrollView {
            // The reference is the planner's (wingtip.performance,
            // CRUISE_REFERENCE_FT, 6,000 ft).
            VStack(alignment: .leading, spacing: WingtipSpace.md) {
                Text("Your airplane's cruise speed and fuel burn are taken as its figures at its cruise power at 6,000 ft on a standard day, a row of its handbook's cruise table.")
                Text("Each leg flies them in the forecast air at its altitude, as a density altitude: faster in thinner air at the same power, and slower and thriftier where full throttle can no longer make it. Climbs slow as the air thins, and a warm day lowers the service ceiling.")
                Text("The nav log gives each leg's TAS, and the altitude's reasoning the rest. A model, within a few percent of most handbooks: yours governs.")
            }
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Your Airplane in the Day's Air")
    }
}

/// The tower's light as the card shows it: a lamp, flashing or
/// alternating as the signal does, and said in words beside it.
struct LampView: View {
    let colours: [Drills.Light]
    let flashing: Bool
    @Environment(\.accessibilityReduceMotion) private var still

    private func colour(_ l: Drills.Light) -> Color {
        switch l {
        case .green: return Color(uiColor: WingtipColor.Signal.green)
        case .red: return Color(uiColor: WingtipColor.Signal.red)
        case .white: return Color(uiColor: WingtipColor.Signal.white)
        }
    }

    var body: some View {
        HStack(spacing: WingtipSpace.md) {
            TimelineView(.periodic(from: .now, by: 0.5)) { context in
                let tick = Int(context.date.timeIntervalSinceReferenceDate * 2) % 2
                let alternating = colours.count > 1
                let lit = alternating ? colour(colours[tick]) : colour(colours.first ?? .white)
                Circle()
                    .fill(lit)
                    .opacity(!alternating && flashing && !still && tick == 1 ? 0.15 : 1)
                    .overlay(Circle().stroke(.black.opacity(0.15)))
                    .frame(width: 48, height: 48)
            }
            .accessibilityHidden(true)
            Text(colours.count > 1 ? "Alternating" : flashing ? "Flashing" : "Steady").font(.footnote).foregroundStyle(.secondary)
        }
    }
}

/// One drill: the cards due, one at a time -- the prompt, Show the
/// Answer, then Knew It or Missed It, which moves the card up a box or
/// back to the first. A card missed comes round again before the session
/// ends. With nothing due, when the next card is, and Practice Them All,
/// which keeps no score.
struct DrillView: View {
    let deck: Drills.Deck
    @State private var progress: Drills.Progress = [:]
    @State private var queue: [String] = []
    @State private var practice = false
    @State private var revealed = false
    @State private var done = 0
    @State private var now = Date()
    @State private var started = false

    var body: some View {
        List {
            if let card = deck.cards.first(where: { $0.id == queue.first }) {
                Section {
                    VStack(alignment: .leading, spacing: WingtipSpace.md) {
                        if !card.colours.isEmpty { LampView(colours: card.colours, flashing: card.flashing) }
                        Text(card.prompt).font(.title3.weight(.semibold))
                        if revealed {
                            Text(card.answer).font(.body.weight(.medium))
                            if let detail = card.detail { Text(detail).font(.footnote).foregroundStyle(.secondary) }
                        }
                    }
                    .padding(.vertical, WingtipSpace.sm)
                    if revealed {
                        HStack {
                            Button("Missed It") { answer(card, knew: false) }.glassButton().frame(maxWidth: .infinity)
                            Button("Knew It") { answer(card, knew: true) }.glassProminentButton().frame(maxWidth: .infinity)
                        }
                    } else {
                        Button("Show the Answer") { revealed = true }
                    }
                } header: {
                    Text((practice ? "Practice: no score kept" : "\(queue.count) to go") + (done > 0 ? " · \(done) done" : "")).monospacedDigit()
                }
            } else {
                Section {
                    LabeledContent {
                        EmptyView()
                    } label: {
                        Text(done > 0 ? "\(done) card\(done == 1 ? "" : "s") done" : "Nothing due")
                        if let next = Drills.nextDue(deck, progress, now: now) {
                            Text("The next one is due \(next.formatted(.relative(presentation: .named))).")
                        } else {
                            Text("Every card is new: start whenever you like.")
                        }
                    }
                    Button("Practice Them All") {
                        practice = true
                        queue = deck.cards.map(\.id)
                        done = 0
                    }
                }
            }
            Section {
                Link(destination: deck.url) {
                    LabeledContent {
                        EmptyView()
                    } label: {
                        Text(deck.source)
                        Text("The regulation, in its own words")
                    }
                }
            }
        }
        .navigationTitle(deck.title)
        .onAppear {
            guard !started else { return }
            started = true
            progress = Drills.kept(deck)
            queue = Drills.due(deck, progress, now: Date()).map(\.id)
        }
    }

    private func answer(_ card: Drills.Card, knew: Bool) {
        let t = Date()
        now = t
        if !practice {
            progress = Drills.answered(progress, card: card.id, knew: knew, now: t)
            Drills.keep(progress, for: deck)
        }
        if knew {
            queue.removeFirst()
            done += 1
        } else {
            let missed = queue.removeFirst()
            queue.append(missed)
        }
        revealed = false
    }
}

/// Two-way radio failure under IFR (14 CFR 91.185): which route applies
/// first, the altitude rule, and when to leave the clearance limit, in
/// the rule's words; the altitude on each segment of the clearance and
/// the line on leaving the limit are the planner's (POST /api/lost-comms).
struct LostCommsView: View {
    @State private var route = "assigned"
    @State private var approachFix = false
    @State private var efc = ""
    @State private var eta = "1435Z"
    @State private var leave: String?

    var body: some View {
        let opening = try? LostComms.opening.get()
        let routes = opening?.routes ?? []
        let leaving = Result {
            try LostComms.leaveLimit(approachFix: approachFix, efc: efc.trimmingCharacters(in: .whitespaces), eta: eta.trimmingCharacters(in: .whitespaces))
        }
        List {
            Section {
                ProblemLine(LostComms.opening, "The rule's words")
                Text(opening?.vfr ?? "")
            }
            Section("Route") {
                Picker("Which applies first", selection: $route) {
                    ForEach(routes, id: \.key) { r in Text(r.label).tag(r.key) }
                }
                .pickerStyle(.segmented)
                Text(routes.first { $0.key == route }?.rule ?? "").font(.subheadline)
            }
            Section("Altitude") {
                Text(opening?.altitude ?? "").font(.subheadline)
            }
            LostCommsSegmentsSections(leave: $leave, approachFix: approachFix,
                                      efc: efc.trimmingCharacters(in: .whitespaces), eta: eta.trimmingCharacters(in: .whitespaces))
            Section("Leaving the Clearance Limit") {
                Toggle("The limit is a fix an approach begins from", isOn: $approachFix)
                LabeledContent {
                    TextField("—", text: $efc).multilineTextAlignment(.trailing).monospacedDigit()
                } label: {
                    Text("Expect further clearance")
                    Text("Blank where none was given")
                }
                LabeledContent {
                    TextField("", text: $eta).multilineTextAlignment(.trailing).monospacedDigit()
                } label: {
                    Text("Your ETA")
                    Text("From the filed or amended time en route")
                }
                Text(leave ?? (try? leaving.get()) ?? "")
                if leave == nil { ProblemLine(leaving, "When to leave the limit") }
            }
        }
        .navigationTitle("Lost Communications")
    }
}

#Preview("PilotGuideView") {
    NavigationStack { PilotGuideView() }
}

#Preview("AirplaneInTheAirView") {
    NavigationStack { AirplaneInTheAirView() }
}

#Preview("LampView") {
    List {
        LampView(colours: [.green], flashing: false)
        LampView(colours: [.red], flashing: true)
        LampView(colours: [.red, .green], flashing: true)
    }
}

#Preview("DrillView") {
    NavigationStack { DrillView(deck: Drills.lightGun) }
}

#Preview("LostCommsView") {
    NavigationStack { LostCommsView() }
}
