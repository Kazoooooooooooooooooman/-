import SwiftUI

/// 初回起動時の説明＋権限リクエスト画面。
struct OnboardingView: View {
    @EnvironmentObject var model: AppModel
    @State private var page = 0

    private struct Page {
        let icon: String
        let title: String
        let body: String
    }

    private let pages: [Page] = [
        Page(icon: "figure.walk",
             title: "外に出るまで、ロック",
             body: "SNSや動画など、つい開いてしまうアプリを、あなたが選んだ場所に着くまでロックします。"),
        Page(icon: "mappin.and.ellipse",
             title: "目的地に着いて解除",
             body: "スーパーなどの解除スポットに到着し、3分間滞在すると自動でロックが外れます。"),
        Page(icon: "lock.shield",
             title: "あなた自身のための制限",
             body: "制限はすべてあなたが自分で設定するもの。対象アプリはいつでも変更できます。"),
    ]

    var body: some View {
        VStack {
            TabView(selection: $page) {
                ForEach(pages.indices, id: \.self) { i in
                    VStack(spacing: 20) {
                        Image(systemName: pages[i].icon)
                            .font(.system(size: 72))
                            .foregroundStyle(.green)
                        Text(pages[i].title)
                            .font(.title).bold()
                            .multilineTextAlignment(.center)
                        Text(pages[i].body)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 32)
                    }
                    .tag(i)
                }
            }
            .tabViewStyle(.page)

            Button {
                if page < pages.count - 1 {
                    withAnimation { page += 1 }
                } else {
                    Task {
                        await model.requestAllPermissions()
                        model.completeOnboarding()
                    }
                }
            } label: {
                Text(page == pages.count - 1 ? "許可して始める" : "次へ")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .padding()
        }
    }
}
