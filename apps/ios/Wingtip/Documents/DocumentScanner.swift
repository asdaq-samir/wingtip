import PhotosUI
import SwiftUI
import VisionKit

/// The system's document camera (VisionKit), which finds the page's edges,
/// flattens it and evens its light: the first page scanned is handed on.
struct DocumentScanner: UIViewControllerRepresentable {
    var onScan: (UIImage) -> Void
    var onEnd: () -> Void

    static var isSupported: Bool { VNDocumentCameraViewController.isSupported }

    func makeUIViewController(context: Context) -> VNDocumentCameraViewController {
        let camera = VNDocumentCameraViewController()
        camera.delegate = context.coordinator
        return camera
    }

    func updateUIViewController(_ controller: VNDocumentCameraViewController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    /// On the main actor, as the camera calls its delegate on the main
    /// thread (UIKit's), where the view's closures live; the protocol is
    /// not marked so, hence @preconcurrency (checked at run time).
    @MainActor
    final class Coordinator: NSObject, @preconcurrency VNDocumentCameraViewControllerDelegate {
        let parent: DocumentScanner

        init(_ parent: DocumentScanner) { self.parent = parent }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
            let page = scan.pageCount > 0 ? scan.imageOfPage(at: 0) : nil
            parent.onEnd()
            if let page { parent.onScan(page) }
        }

        func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
            parent.onEnd()
        }

        func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: any Error) {
            parent.onEnd()
        }
    }
}

/// A page photographed: the document camera where this device has one,
/// else a photo picked from the library (the simulator, an iPad without
/// the camera). `onImage` takes the page; `onProblem` says why there is
/// none where a picked photo would not open.
private struct DocumentPhotoSource: ViewModifier {
    @Binding var isPresented: Bool
    var onImage: (UIImage) -> Void
    var onProblem: (String) -> Void
    @State private var picked: PhotosPickerItem?

    func body(content: Content) -> some View {
        content
            .fullScreenCover(isPresented: Binding(get: { isPresented && DocumentScanner.isSupported }, set: { isPresented = $0 })) {
                DocumentScanner(onScan: onImage, onEnd: { isPresented = false }).ignoresSafeArea()
            }
            .photosPicker(isPresented: Binding(get: { isPresented && !DocumentScanner.isSupported }, set: { isPresented = $0 }),
                          selection: $picked, matching: .images)
            .onChange(of: picked) { _, item in
                guard let item else { return }
                Task {
                    defer { picked = nil }
                    if let data = try? await item.loadTransferable(type: Data.self), let image = UIImage(data: data) {
                        onImage(image)
                    } else {
                        onProblem("That photo could not be opened.")
                    }
                }
            }
    }
}

extension View {
    /// A page photographed when `isPresented` is set (DocumentPhotoSource).
    func documentPhoto(isPresented: Binding<Bool>, onImage: @escaping (UIImage) -> Void, onProblem: @escaping (String) -> Void) -> some View {
        modifier(DocumentPhotoSource(isPresented: isPresented, onImage: onImage, onProblem: onProblem))
    }
}

/// "Reading the page…" with the system's spinner, while the reader works.
struct ReadingRow: View {
    var body: some View {
        HStack(spacing: WingtipSpace.sm) {
            ProgressView()
            Text("Reading the page…").foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .combine)
    }
}
