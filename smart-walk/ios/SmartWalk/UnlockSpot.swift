import CoreLocation

/// 解除スポット。MVPでは運営が登録した固定リストを使う。
struct UnlockSpot: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let category: String        // MVPは "supermarket" のみ
    let latitude: Double
    let longitude: Double
    let radius: Double          // ジオフェンス半径(m)
    var isSponsored: Bool       // 企業出稿枠（UI上で「PR」表示が必要）

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    func region() -> CLCircularRegion {
        let region = CLCircularRegion(center: coordinate, radius: radius, identifier: id)
        region.notifyOnEntry = true
        region.notifyOnExit = true
        return region
    }

    /// 指定地点からこのスポットまでの距離(m)。location が nil なら nil。
    func distance(from location: CLLocation?) -> CLLocationDistance? {
        guard let location else { return nil }
        return location.distance(from: CLLocation(latitude: latitude, longitude: longitude))
    }
}

extension UnlockSpot {
    /// MVP用のサンプルデータ。本番はサーバー配信に置き換える。
    static let samples: [UnlockSpot] = [
        UnlockSpot(id: "spot-shibuya", name: "サンプルスーパー渋谷店",
                   category: "supermarket",
                   latitude: 35.6595, longitude: 139.7005,
                   radius: 80, isSponsored: true),
        UnlockSpot(id: "spot-shinjuku", name: "サンプルスーパー新宿店",
                   category: "supermarket",
                   latitude: 35.6896, longitude: 139.7006,
                   radius: 80, isSponsored: false),
    ]
}
