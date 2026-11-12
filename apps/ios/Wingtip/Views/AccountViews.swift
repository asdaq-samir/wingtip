import SwiftUI

extension Plan {
    /// The airplane the pilot flew and its figures, forgotten as they sign
    /// out: the next person on the device had them (the web app's
    /// forgetPilot, the audit's finding).
    func forgetPilot() {
        forgetHistory()
        tail = nil
        figures = Figures()
    }
}

/// The pilot's contact as the gateway keeps it (PilotContactRequest): a
/// phone for Flight Service and an instructor, and the home base.
struct ContactView: View {
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var phone = ""
    @State private var homeBase = ""
    @State private var saving = false
    @State private var problem: String?

    var body: some View {
        Form {
            Section {
                LabeledContent("Phone") {
                    TextField("218 555 0100", text: $phone).multilineTextAlignment(.trailing).keyboardType(.phonePad).textContentType(.telephoneNumber)
                }
                LabeledContent("Home base") {
                    TextField("KDLH", text: $homeBase).multilineTextAlignment(.trailing).font(.body.monospaced())
                        .textInputAutocapitalization(.characters).autocorrectionDisabled()
                }
            }
            ProblemLine(problem)
        }
        .navigationTitle("Contact")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    saving = true
                    Task {
                        let p = phone.trimmingCharacters(in: .whitespaces), h = homeBase.trimmingCharacters(in: .whitespaces).uppercased()
                        do { try await session.setContact(phone: p.isEmpty ? nil : p, homeBase: h.isEmpty ? nil : h); dismiss() }
                        catch { problem = error.localizedDescription }
                        saving = false
                    }
                }
                .disabled(saving)
            }
        }
        .onAppear {
            phone = session.pilot?.phone ?? ""
            homeBase = session.pilot?.homeBase ?? ""
        }
    }
}

/// Delete Account, asked first in the system's own dialog, as App Review
/// asks an app with accounts to offer (5.1.1(v)).
struct DeleteAccountButton: View {
    @Environment(Session.self) private var session
    @Environment(Plan.self) private var plan
    @State private var asking = false
    @State private var deleting = false
    @State private var problem: String?

    var body: some View {
        Button(deleting ? "Deleting…" : "Delete Account", role: .destructive) { asking = true }
            .disabled(deleting)
            .confirmationDialog("Delete your account?", isPresented: $asking, titleVisibility: .visible) {
                Button("Delete Account", role: .destructive) {
                    deleting = true
                    Task {
                        do {
                            try await session.deleteAccount()
                            plan.clear()
                            plan.forgetPilot()
                            problem = nil
                        } catch {
                            problem = "Your account was not deleted: \(error.localizedDescription)"
                        }
                        deleting = false
                    }
                }
            } message: {
                Text("Your airplanes, flights, logbook and endorsements go, and you are signed out on every device. This can't be undone.")
            }
        ProblemLine(problem)
    }
}

/// Export My Data: everything the gateway keeps of the pilot fetched as
/// one JSON file (DataExport) when iOS's share sheet asks for it, to save
/// to Files, AirDrop or mail, as the privacy policy promises: the system's
/// ShareLink, which shows its own progress while the file comes.
struct ExportDataButton: View {
    @State private var export = DataExportState()

    var body: some View {
        ShareLink(item: SharedFile(name: nil, type: .json) { [export] in try await export.fetch() },
                  preview: SharePreview("Your Wingtip Maps data")) {
            Text("Export My Data")
        }
        ProblemLine(export.problem)
    }
}

/// Why the export could not be had, said under its row.
@MainActor
@Observable
final class DataExportState {
    var problem: String?

    func fetch() async throws -> URL {
        do {
            let file = try await DataExport.fetch()
            problem = nil
            return file
        } catch {
            problem = "Your data could not be exported: \(error.localizedDescription)"
            throw error
        }
    }
}

#Preview("ContactView") {
    NavigationStack { ContactView() }
        .environment(Session())
}

#Preview("DeleteAccountButton") {
    List { DeleteAccountButton() }
        .environment(Session())
        .environment(Plan())
}
