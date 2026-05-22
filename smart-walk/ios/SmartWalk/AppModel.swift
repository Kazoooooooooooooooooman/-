import Foundation
import FamilyControls

/// アプリ全体の状態を束ねる。認可・対象アプリ選択・解除スポット・ロック状態を管理。
@MainActor
final class AppModel: ObservableObject {
    @Published var auth = AuthorizationManager()
    @Published var location = LocationManager()

    @Published var selection = FamilyActivitySelection() { didSet { persistSelection() } }
    @Published var selectedSpot: UnlockSpot? { didSet { persistSpot() } }
    @Published private(set) var isLocked = true

    /// 解除に必要な連続滞在時間（秒）。通り過ぎ・素通りでの解除を防ぐ。
    let dwellRequirement: TimeInterval = 180
    @Published private(set) var dwellRemaining: TimeInterval = 0

    let spots = UnlockSpot.samples
    private let restriction = RestrictionManager()
    private let defaults = UserDefaults(suiteName: AppGroup.identifier) ?? .standard
    private var dwellTimer: Timer?

    func bootstrap() async {
        auth.refresh()
        restoreSelection()
        restoreSpot()
        location.onRegionChange = { [weak self] isInside in
            Task { @MainActor in self?.handleRegionChange(isInside: isInside) }
        }
        if let spot = selectedSpot {
            location.startMonitoring(spot: spot)
        }
    }

    func requestAllPermissions() async {
        await auth.requestAuthorization()
        location.requestAuthorization()
    }

    func chooseSpot(_ spot: UnlockSpot) {
        selectedSpot = spot
        location.startMonitoring(spot: spot)
    }

    /// スポットの出入りに応じて滞在タイマーを制御する。
    private func handleRegionChange(isInside: Bool) {
        if isInside {
            startDwell()
        } else {
            cancelDwell()
            applyLockState(locked: true)
        }
    }

    /// 圏内に入ったら滞在カウントを開始。連続滞在が要件時間に達したら解除する。
    /// 注: Timer はバックグラウンド/終了状態では確実に発火しないため、本番では
    /// 到着時刻を起点にした DeviceActivitySchedule での滞在判定を推奨。
    private func startDwell() {
        guard isLocked, dwellTimer == nil else { return }
        dwellRemaining = dwellRequirement
        dwellTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tickDwell() }
        }
    }

    private func tickDwell() {
        dwellRemaining -= 1
        if dwellRemaining <= 0 {
            cancelDwell()
            applyLockState(locked: false)
        }
    }

    private func cancelDwell() {
        dwellTimer?.invalidate()
        dwellTimer = nil
        dwellRemaining = 0
    }

    /// 現在地評価やジオフェンスイベントに応じてシールドを適用/解除する。
    func applyLockState(locked: Bool) {
        isLocked = locked
        if locked {
            restriction.lock(selection)
        } else {
            restriction.unlock()
        }
    }

    // MARK: - 永続化（App Group 経由で拡張機能とも共有）

    private func persistSelection() {
        guard let data = try? JSONEncoder().encode(selection) else { return }
        defaults.set(data, forKey: "selection")
    }

    private func restoreSelection() {
        guard let data = defaults.data(forKey: "selection"),
              let decoded = try? JSONDecoder().decode(FamilyActivitySelection.self, from: data)
        else { return }
        selection = decoded
    }

    private func persistSpot() {
        guard let spot = selectedSpot, let data = try? JSONEncoder().encode(spot) else {
            defaults.removeObject(forKey: "spot"); return
        }
        defaults.set(data, forKey: "spot")
    }

    private func restoreSpot() {
        guard let data = defaults.data(forKey: "spot"),
              let decoded = try? JSONDecoder().decode(UnlockSpot.self, from: data)
        else { return }
        selectedSpot = decoded
    }
}

enum AppGroup {
    /// Xcode の App Groups capability で本体・拡張すべてに同じIDを設定すること。
    static let identifier = "group.com.example.smartwalk"
}
