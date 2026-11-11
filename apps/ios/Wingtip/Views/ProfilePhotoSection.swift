import PhotosUI
import SwiftUI

/// The profile's figures read off a photo of the handbook's
/// specifications page (Handbook: Apple's Vision on the phone, the
/// engine's handbook_figures), put in the fields for the pilot to check
/// against the page, then saved together. One the page does not label
/// plainly is not guessed.
struct ProfilePhotoSection: View {
    let model: AirplaneProfileModel
    let save: () -> Void
    @State private var picked: PhotosPickerItem?
    @State private var reading = false
    @State private var words: [String] = []
    @State private var problem: String?

    var body: some View {
        Section {
            let title = reading ? "Reading the Page…" : "Read From a Photo"
            PhotosPicker(selection: $picked, matching: .images) { Label(title, systemImage: "camera") }
                .disabled(reading)
            if !words.isEmpty {
                Button("Save Read Figures") { words = []; save() }
            }
        } footer: {
            VStack(alignment: .leading, spacing: WingtipSpace.xs) {
                if !words.isEmpty {
                    Text("Read from the page: check each against it before saving.").font(WingtipType.label)
                    ForEach(words, id: \.self) { Text($0).font(WingtipType.note) }
                }
                ProblemLine(problem)
            }
        }
        .onChange(of: picked) { _, item in
            guard let item else { return }
            Task { await read(item) }
        }
    }

    private func read(_ item: PhotosPickerItem) async {
        reading = true; problem = nil; words = []
        defer { reading = false; picked = nil }
        guard let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) else {
            problem = "That photo couldn't be opened."
            return
        }
        do {
            let found = try Handbook.figures(of: try await Handbook.read(image))
            if found.isEmpty { problem = "No figures were read off that page: take the specifications page, flat and in good light."; return }
            let pairs: [(OwnFigure, Handbook.Figure?)] = [
                (.cruiseTasKt, found.cruiseTasKt), (.cruisePowerPct, found.cruisePowerPct), (.fuelBurnGph, found.fuelBurnGph),
                (.usableFuelGal, found.usableFuelGal), (.climbTasKt, found.climbTasKt), (.serviceCeilingFt, found.serviceCeilingFt),
            ]
            for (figure, read) in pairs { if let read { model.drafts[figure] = Format.tenths(read.value) } }
            words = Array(Set(found.words)).sorted()
        } catch {
            problem = "The page couldn't be read: \(error.localizedDescription)"
        }
    }
}
