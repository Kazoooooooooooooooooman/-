import DeviceActivity
import ManagedSettings
import FamilyControls

/// DeviceActivity 監視拡張。
/// ジオフェンスによる即時ロック/解除に加え、スケジュール境界での
/// 「保険の再ロック」を担う（位置取得が遅延・失敗したケースの取りこぼし防止）。
final class DeviceActivityMonitorExtension: DeviceActivityMonitor {
    private let store = ManagedSettingsStore(named: .smartWalk)

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        applyShieldFromSharedState()
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        applyShieldFromSharedState()
    }

    /// App Group 経由で本体が保存した選択内容を読み、シールドを再適用する。
    private func applyShieldFromSharedState() {
        guard
            let defaults = UserDefaults(suiteName: "group.com.example.smartwalk"),
            let data = defaults.data(forKey: "selection"),
            let selection = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return }

        store.shield.applications =
            selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories =
            selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
    }
}

extension ManagedSettingsStore.Name {
    static let smartWalk = Self("smartWalk")
}
