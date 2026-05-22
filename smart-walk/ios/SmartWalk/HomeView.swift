import SwiftUI
import MapKit

/// 現在の状態（ロック/滞在中/解除）と、解除スポットの地図を表示する。
struct HomeView: View {
    @EnvironmentObject var model: AppModel
    @State private var region = MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 35.681, longitude: 139.767),
        span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02))

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    statusCard
                    if let spot = model.selectedSpot {
                        mapCard(for: spot)
                    } else {
                        noSpotCard
                    }
                }
                .padding()
            }
            .navigationTitle("スマートウォーク")
            .onAppear(perform: centerOnSpot)
            .onChange(of: model.selectedSpot) { _ in centerOnSpot() }
        }
    }

    // MARK: - 状態カード

    private var statusCard: some View {
        VStack(spacing: 8) {
            Image(systemName: statusIcon)
                .font(.system(size: 52))
                .foregroundStyle(statusColor)
            Text(statusTitle)
                .font(.title2).bold()
            if model.dwellRemaining > 0 {
                Text("解除まで \(formatTime(model.dwellRemaining))")
                    .foregroundStyle(.orange)
            }
            if let distance = model.distanceToSpot {
                Text("目的地まで 約\(Int(distance)) m")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(statusBackground)
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    private var isDwelling: Bool { model.dwellRemaining > 0 }

    private var statusIcon: String {
        if !model.isLocked { return "lock.open.fill" }
        return isDwelling ? "hourglass" : "lock.fill"
    }

    private var statusTitle: String {
        if !model.isLocked { return "解除中" }
        return isDwelling ? "滞在中" : "ロック中"
    }

    private var statusColor: Color {
        if !model.isLocked { return .green }
        return isDwelling ? .orange : .red
    }

    private var statusBackground: Color {
        if !model.isLocked { return Color.green.opacity(0.12) }
        return isDwelling ? Color.orange.opacity(0.12) : Color(.secondarySystemBackground)
    }

    // MARK: - 地図カード

    private func mapCard(for spot: UnlockSpot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(spot.name).font(.headline)
            Map(coordinateRegion: $region,
                showsUserLocation: true,
                annotationItems: [spot]) { item in
                MapMarker(coordinate: item.coordinate, tint: .green)
            }
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 16))
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    private var noSpotCard: some View {
        VStack(spacing: 8) {
            Image(systemName: "mappin.slash")
                .font(.title)
                .foregroundStyle(.secondary)
            Text("解除スポットが未選択です")
            Text("「スポット」タブで目的地を選んでください")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 20))
    }

    // MARK: - ヘルパー

    private func centerOnSpot() {
        guard let spot = model.selectedSpot else { return }
        region = MKCoordinateRegion(
            center: spot.coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01))
    }

    private func formatTime(_ seconds: TimeInterval) -> String {
        let total = Int(seconds)
        return String(format: "%d:%02d", total / 60, total % 60)
    }
}
