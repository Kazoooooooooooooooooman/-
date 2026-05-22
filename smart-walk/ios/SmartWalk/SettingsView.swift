import SwiftUI
import FamilyControls

/// スクリーンタイム認可とロック対象アプリの設定。
struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @State private var showingPicker = false

    var body: some View {
        NavigationStack {
            List {
                Section("スクリーンタイム") {
                    if model.auth.isAuthorized {
                        Label("認可済み", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(.green)
                    } else {
                        Button("スクリーンタイムを許可する") {
                            Task { await model.requestAllPermissions() }
                        }
                    }
                }

                Section("ロック対象アプリ") {
                    Button("対象アプリを選ぶ") { showingPicker = true }
                        .disabled(!model.auth.isAuthorized)
                    Text("\(selectedCount) 件を選択中")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    Text("制限はすべてあなた自身が設定するものです。スマートウォークが他人の端末を管理することはありません。")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("設定")
            .familyActivityPicker(isPresented: $showingPicker, selection: $model.selection)
        }
    }

    private var selectedCount: Int {
        model.selection.applicationTokens.count
            + model.selection.categoryTokens.count
            + model.selection.webDomainTokens.count
    }
}
