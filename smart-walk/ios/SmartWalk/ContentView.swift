import SwiftUI

/// ルート。初回はオンボーディング、完了後はタブ画面を表示する。
struct ContentView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        if model.hasCompletedOnboarding {
            MainTabView()
        } else {
            OnboardingView()
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("ホーム", systemImage: "house.fill") }
            SpotListView()
                .tabItem { Label("スポット", systemImage: "mappin.and.ellipse") }
            SettingsView()
                .tabItem { Label("設定", systemImage: "gearshape.fill") }
        }
    }
}
