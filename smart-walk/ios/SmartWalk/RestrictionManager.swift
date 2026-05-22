import FamilyControls
import ManagedSettings

/// ManagedSettings を使って対象アプリのシールド（ロック）を適用・解除する。
struct RestrictionManager {
    /// ストア名は本体と DeviceActivity 拡張で一致させる必要がある。
    private let store = ManagedSettingsStore(named: .smartWalk)

    func lock(_ selection: FamilyActivitySelection) {
        store.shield.applications =
            selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories =
            selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
        store.shield.webDomains =
            selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    }

    func unlock() {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
    }
}

extension ManagedSettingsStore.Name {
    static let smartWalk = Self("smartWalk")
}
