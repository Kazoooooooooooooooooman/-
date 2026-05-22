import SwiftUI
import FamilyControls

struct ContentView: View {
    @EnvironmentObject var model: AppModel
    @State private var showingPicker = false

    var body: some View {
        NavigationStack {
            List {
                statusSection
                setupSection
                spotSection
            }
            .navigationTitle("スマートウォーク")
            .familyActivityPicker(isPresented: $showingPicker, selection: $model.selection)
        }
    }

    private var statusSection: some View {
        Section("現在の状態") {
            HStack {
                Image(systemName: model.isLocked ? "lock.fill" : "lock.open.fill")
                    .foregroundStyle(model.isLocked ? .red : .green)
                Text(model.isLocked ? "ロック中" : "解除中")
                    .font(.headline)
            }
            if let spot = model.selectedSpot {
                Text("目的地: \(spot.name)")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var setupSection: some View {
        Section("セットアップ") {
            if !model.auth.isAuthorized {
                Button("スクリーンタイムを許可する") {
                    Task { await model.requestAllPermissions() }
                }
            } else {
                Label("スクリーンタイム認可済み", systemImage: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
            Button("ロックするアプリを選ぶ") { showingPicker = true }
                .disabled(!model.auth.isAuthorized)
        }
    }

    private var spotSection: some View {
        Section("解除スポット") {
            ForEach(model.spots) { spot in
                Button {
                    model.chooseSpot(spot)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(spot.name)
                            if spot.isSponsored {
                                Text("PR").font(.caption2).bold()
                                    .padding(.horizontal, 4)
                                    .background(.yellow.opacity(0.3))
                            }
                        }
                        Spacer()
                        if model.selectedSpot?.id == spot.id {
                            Image(systemName: "checkmark").foregroundStyle(.tint)
                        }
                    }
                }
                .tint(.primary)
            }
        }
    }
}
