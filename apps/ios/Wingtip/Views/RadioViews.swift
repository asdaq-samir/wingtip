import SwiftUI

/// The radio over the map while the app listens (ClearanceListener), as
/// the web app's RadioLayer: a call to us with a tap for each thing the
/// app can do of it, then the captions -- the last transmission settled
/// and the one being said, a call to us in the tint, as iOS's Live
/// Captions sit over what is under them. A tap on the captions opens the
/// radio's sheet with the whole log.
struct RadioOverlay: View {
    @Environment(ClearanceListener.self) private var listener
    @Environment(\.lookAccent) private var accent
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip

    var body: some View {
        VStack(spacing: WingtipSpace.sm) {
            if let call = listener.call {
                RadioCallBanner(call: call)
            }
            if listener.listening || listener.problem != nil {
                Button {
                    listener.sheetText = listener.heard.last(where: \.final)?.text
                    listener.sheetShown = true
                } label: {
                    HStack(alignment: .top, spacing: WingtipSpace.sm) {
                        // The radio's waves, lit in turn while it listens
                        // (never the mic's look, which is Ask by voice's);
                        // with Reduce Motion on the tint and the words say it.
                        Image(systemName: WingtipIcon.radio).foregroundStyle(listener.listening ? accent : .secondary)
                            .symbolOnAir(listener.listening)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: WingtipSpace.xxs) {
                            if let problem = listener.problem {
                                ProblemLine(problem)
                            } else if listener.heard.isEmpty {
                                Text("Listening to the radio…").foregroundStyle(.secondary)
                            }
                            ForEach(listener.heard.suffix(2)) { t in
                                Text("Heard: \(t.text)").lineLimit(2)
                                    .foregroundStyle(t.forUs ? accent : Color.primary)
                                    .fontWeight(t.forUs ? .semibold : .regular)
                                    .opacity(t.final ? 1 : 0.8)
                            }
                        }
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.horizontal, WingtipSpace.md).padding(.vertical, WingtipSpace.sm)
                    .floatingGlass(in: floatingCard)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("What the radio is saying: open the log")
            }
        }
        .frame(maxWidth: 440)
        .padding(.horizontal, WingtipSpace.md)
        .onChange(of: plan.tail, initial: true) { _, tail in listener.tail = tail }
    }
}

/// A call to us, what it asked and a tap for each thing the app can do
/// of it: Direct To the place said (found near the route, flown from
/// where the airplane is), Enter Route for a clearance (its sheet, to
/// read it first), Fly the altitude. Nothing is done until it is tapped;
/// ✕ puts it away.
struct RadioCallBanner: View {
    @Environment(AtcCopilot.self) private var atc
    @Environment(ClearanceListener.self) private var listener
    @Environment(\.lookAccent) private var accent
    let call: ClearanceListener.Transmission
    @Environment(Plan.self) private var plan
    @Environment(OwnShip.self) private var ownShip
    @State private var problem: String?
    @State private var busy = false

    var body: some View {
        // A call the engine cannot read shows as heard, with nothing read
        // out of it and no Direct To, and says so under it (logged by Engine.rule).
        let read = Result { try Clearance.read(call.text) }
        let clearance = (try? read.get()) ?? Clearance()
        let directRead = Result { try HeardCall.directOf(call.text) }
        let direct = try? directRead.get()
        VStack(alignment: .leading, spacing: WingtipSpace.sm) {
            HStack(alignment: .top, spacing: WingtipSpace.sm) {
                Image(systemName: "dot.radiowaves.left.and.right").foregroundStyle(accent).accessibilityHidden(true)
                Text(call.text).font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityLabel("A call to you: \(call.text)")
                Button { listener.seen = call.id } label: {
                    // The 44-point hit area round the glyph, which does not grow.
                    Image(systemName: "xmark").contentShape(Rectangle().inset(by: -12))
                }
                .buttonStyle(.borderless).accessibilityLabel("Put away")
            }
            // The ATC copilot's reading of it, where it is on: each item
            // the engine read (atc_call), and the readback checked.
            if let card = atc.card(for: call.id) {
                AtcCardRows(card: card, tail: plan.tail)
            }
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: WingtipSpace.sm) {
                    if let direct, ownShip.fix != nil {
                        Button("Direct To \(direct.capitalized)") { Task { await go(direct) } }.disabled(busy)
                    }
                    if clearance.limit != nil || !clearance.route.isEmpty {
                        Button("Enter Route") {
                            listener.sheetText = call.text
                            listener.seen = call.id
                            listener.sheetShown = true
                        }
                    }
                    if let ft = clearance.maintainFt, !clearance.vfr {
                        Button("Fly \(Altitudes.said(Double(ft)))") {
                            plan.ownAltitudeFt = Double(ft)
                            plan.ownAltitudeLegal = false
                            Feel.tap(.altitude)
                            plan.plan()
                            listener.seen = call.id
                        }
                    }
                    if let frequency = clearance.frequency {
                        FrequencyCopyButton(figure: frequency)
                    }
                    if let squawk = clearance.squawk { Text("Squawk \(squawk)").font(.subheadline.weight(.semibold)) }
                }
                .glassButton()
                .buttonBorderShape(.capsule)
            }
            if let problem { ProblemLine(problem) }
            ProblemLine(read, "What the call asks")
            ProblemLine(directRead, "A Direct To in it")
        }
        .padding(WingtipSpace.md)
        .floatingGlass(in: floatingCard)
    }

    /// Direct to the place said, found near the route and the airplane.
    private func go(_ said: String) async {
        busy = true
        defer { busy = false }
        var points: [(Double, Double)] = []
        if let course = plan.course {
            points += [(course.departure.lat, course.departure.lon), (course.destination.lat, course.destination.lon)]
        }
        if let fix = ownShip.fix { points.append((fix.coordinate.latitude, fix.coordinate.longitude)) }
        let near = points.map { String(format: "%.3f,%.3f", $0.0, $0.1) }.joined(separator: ";")
        do {
            let found = try await Planner.clearancePlaces(ClearanceAsk(near: near, route: [said]))
            guard let ident = found.route?.first?.first(where: { $0.ident != nil })?.ident else {
                problem = "“\(said)” was not found near the route."
                return
            }
            plan.directTo(ident, from: ownShip.fix)
            listener.seen = call.id
        } catch {
            // No signal: found by the engine among the places of the
            // regions kept for the air.
            let offline = ClearanceLookup.offline(call.text, near: points, dep: plan.dep, stops: plan.stops, dest: plan.dest)
            guard let ident = offline?.directFound?.ident else {
                problem = "No signal, and “\(said)” is not in the regions kept for the air."
                return
            }
            plan.directTo(ident, from: ownShip.fix)
            listener.seen = call.id
        }
    }
}

#Preview("RadioCallBanner") {
    RadioCallBanner(call: ClearanceListener.Transmission(
        id: 1, at: Date(), text: "Skyhawk one two three alpha bravo, proceed direct Livermore, maintain four thousand five hundred",
        final: true, forUs: true))
        .padding()
        .environment(Plan())
        .environment(OwnShip())
}
