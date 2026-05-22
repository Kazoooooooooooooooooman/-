import FamilyControls

/// Family Controls の認可を扱う。本人が自分の端末を自己制限する個人モードを使う。
@MainActor
final class AuthorizationManager: ObservableObject {
    @Published private(set) var isAuthorized = false

    private let center = AuthorizationCenter.shared

    func refresh() {
        isAuthorized = center.authorizationStatus == .approved
    }

    /// 認可をリクエスト。初回はシステムのスクリーンタイム認証ダイアログが出る。
    func requestAuthorization() async {
        do {
            try await center.requestAuthorization(for: .individual)
        } catch {
            // ユーザーが拒否、またはペアレンタルコントロールで禁止されている
        }
        refresh()
    }
}
