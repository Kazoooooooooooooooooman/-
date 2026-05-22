import SwiftUI

/// 解除スポット一覧。出稿スポット優先・近い順に並び、選択すると目的地になる。
struct SpotListView: View {
    @EnvironmentObject var model: AppModel

    var body: some View {
        NavigationStack {
            List(model.sortedSpots()) { spot in
                Button {
                    model.chooseSpot(spot)
                } label: {
                    row(for: spot)
                }
                .tint(.primary)
            }
            .navigationTitle("解除スポット")
        }
    }

    private func row(for spot: UnlockSpot) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Text(spot.name)
                    if spot.isSponsored {
                        Text("PR")
                            .font(.caption2).bold()
                            .padding(.horizontal, 5)
                            .padding(.vertical, 1)
                            .background(Color.yellow.opacity(0.4))
                            .clipShape(Capsule())
                    }
                }
                if let distance = spot.distance(from: model.location.currentLocation) {
                    Text("約\(Int(distance)) m")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            if model.selectedSpot?.id == spot.id {
                Image(systemName: "checkmark.circle.fill")
                    .foregroundStyle(.green)
            }
        }
    }
}
