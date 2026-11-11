import Foundation
import os
import Security

/// The gateway's cookies -- the 30-day session among them -- kept in the
/// Keychain, readable after the phone's first unlock and never leaving it
/// (kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly: no backup, no other
/// device), where they were a file in the App Group's container with the
/// default Data Protection (the security audit of 2026-11-10, L9). The
/// app and its widgets each hold them in memory (`jar`), read from the
/// Keychain item they share through the App Group's access group, and
/// write them back after each answer that changed them (`keep`). The
/// first launch with this moves the cookies the App Group's jar held
/// into the Keychain and empties that jar, once.
enum SessionCookies {
    /// The Keychain item's names.
    static let service = "app.wingtipmaps.session"
    static let account = "gateway-cookies"

    /// The cookies in memory, as URLSession keeps them, filled from the
    /// Keychain (or the old jar, moved) when first used.
    static let jar: HTTPCookieStorage = {
        // An ephemeral configuration's own store, in memory only; it
        // always has one.
        let jar = URLSessionConfiguration.ephemeral.httpCookieStorage!
        jar.cookieAcceptPolicy = .always
        let vault = Vault.shared
        let kept = vault.read().map(decode) ?? (vault.isUnread ? [] : migrate(from: HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: WidgetSnapshot.suite), vault: vault))
        for cookie in kept { jar.setCookie(cookie) }
        return jar
    }()

    /// The jar written to the Keychain where it changed since last
    /// written: after every gateway answer, so a sign-in, a renewed
    /// session and a sign-out (its cookie expired) are each kept.
    static func keep(_ jar: HTTPCookieStorage = jar, vault: Vault = .shared) {
        let live = (jar.cookies ?? []).filter { ($0.expiresDate ?? .distantFuture) > Date() }
        vault.write(live.isEmpty ? nil : encode(live))
    }

    /// The cookies of the App Group's old jar, put in the Keychain and
    /// taken out of the jar: the move made once, since the jar is then
    /// empty and the Keychain answers from then on.
    static func migrate(from old: HTTPCookieStorage, vault: Vault) -> [HTTPCookie] {
        let cookies = (old.cookies ?? []).filter { ($0.expiresDate ?? .distantFuture) > Date() }
        if !cookies.isEmpty { vault.write(encode(cookies)) }
        for cookie in old.cookies ?? [] { old.deleteCookie(cookie) }
        return cookies
    }

    // MARK: The cookies as bytes

    /// A property list of each cookie's properties, a URL written as its text.
    static func encode(_ cookies: [HTTPCookie]) -> Data? {
        let plist: [[String: Any]] = cookies.compactMap { cookie in
            guard let properties = cookie.properties else { return nil }
            var out: [String: Any] = [:]
            for (key, value) in properties { out[key.rawValue] = (value as? URL)?.absoluteString ?? value }
            return out
        }
        return try? PropertyListSerialization.data(fromPropertyList: plist, format: .binary, options: 0)
    }

    /// The cookies again; none from bytes that are not a list of them.
    static func decode(_ data: Data) -> [HTTPCookie] {
        guard let plist = (try? PropertyListSerialization.propertyList(from: data, format: nil)) as? [[String: Any]] else { return [] }
        return plist.compactMap { item in
            HTTPCookie(properties: Dictionary(uniqueKeysWithValues: item.map { (HTTPCookiePropertyKey($0.key), $0.value) }))
        }
    }

    // MARK: The Keychain

    /// One Keychain item, written only when its bytes change.
    final class Vault: Sendable {
        static let shared = Vault(service: SessionCookies.service, account: SessionCookies.account, group: WidgetSnapshot.suite)

        let service: String
        let account: String
        /// The App Group as the access group the widgets share; nil, the
        /// app's own (a build signed without the group, such as a test's).
        let group: String?
        private let written = OSAllocatedUnfairLock<Data??>(initialState: nil)
        /// Set where the item could not be read for a reason other than
        /// its absence (the phone not yet unlocked since it started): the
        /// jar is then empty for want of a read, not a sign-out, so
        /// nothing is written over the item until it reads.
        private let unread = OSAllocatedUnfairLock(initialState: false)

        init(service: String, account: String, group: String?) {
            self.service = service
            self.account = account
            self.group = group
        }

        /// Whether the last read failed other than for want of the item.
        var isUnread: Bool { unread.withLock { $0 } }

        private func query(_ group: String?) -> [String: Any] {
            var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                        kSecAttrService as String: service, kSecAttrAccount as String: account]
            if let group { query[kSecAttrAccessGroup as String] = group }
            return query
        }

        /// The access group to use: the App Group where the build is
        /// entitled to it, else the app's own.
        private func usable(_ status: OSStatus) -> Bool { status != errSecMissingEntitlement }

        func read() -> Data? {
            for group in [group, nil] {
                var ask = query(group)
                ask[kSecReturnData as String] = true
                ask[kSecMatchLimit as String] = kSecMatchLimitOne
                var out: CFTypeRef?
                let status = SecItemCopyMatching(ask as CFDictionary, &out)
                if status == errSecSuccess, let data = out as? Data {
                    written.withLock { $0 = .some(data) }
                    unread.withLock { $0 = false }
                    return data
                }
                if usable(status) {
                    unread.withLock { $0 = status != errSecItemNotFound }
                    return nil
                }
            }
            return nil
        }

        /// The bytes kept, or the item deleted for nil.
        func write(_ data: Data?) {
            guard !unread.withLock({ $0 }) else { return }
            let same = written.withLock { last -> Bool in
                if case .some(let was) = last, was == data { return true }
                last = .some(data)
                return false
            }
            guard !same else { return }
            for group in [group, nil] {
                let status = SecItemDelete(query(group) as CFDictionary)
                guard usable(status) else { continue }
                guard let data else { return }
                var add = query(group)
                add[kSecValueData as String] = data
                add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
                let added = SecItemAdd(add as CFDictionary, nil)
                if usable(added) {
                    if added != errSecSuccess { written.withLock { $0 = nil } }
                    return
                }
            }
        }
    }
}
