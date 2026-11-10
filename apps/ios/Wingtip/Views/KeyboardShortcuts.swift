import SwiftUI

/// The planner's keys with a hardware keyboard, on the iPad above all
/// (docs/design/ios.md §16; HIG Keyboards): ⌘F the one search, ⌘B the
/// Brief, ⌘L the nav log. Each is a real button the system lists in its
/// ⌘-held overlay; they sit behind the content, take no room and are
/// hidden from VoiceOver, which has its own way to each.
struct KeyboardShortcuts: ViewModifier {
    let search: () -> Void
    let open: (Screen) -> Void

    func body(content: Content) -> some View {
        content.background {
            Group {
                Button("Search", action: search).keyboardShortcut("f", modifiers: .command)
                Button("Brief") { open(.brief) }.keyboardShortcut("b", modifiers: .command)
                Button("Nav Log") { open(.navlog) }.keyboardShortcut("l", modifiers: .command)
            }
            .opacity(0)
            .frame(width: 0, height: 0)
            .accessibilityHidden(true)
        }
    }
}
