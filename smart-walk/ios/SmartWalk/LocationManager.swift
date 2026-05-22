import CoreLocation

/// 解除スポットのジオフェンス監視と、距離表示用の現在地取得を行う。
/// 領域監視はアプリがバックグラウンド・終了状態でも動作し、出入りで再起動される。
final class LocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var insideSpot = false
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var currentLocation: CLLocation?

    /// スポット圏内に入った/出たときに呼ばれる。
    var onRegionChange: ((_ isInside: Bool) -> Void)?

    private let manager = CLLocationManager()
    private var monitoredSpot: UnlockSpot?

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 25
        manager.allowsBackgroundLocationUpdates = true
        manager.pausesLocationUpdatesAutomatically = false
        authorizationStatus = manager.authorizationStatus
    }

    func requestAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    /// 距離表示のための現在地取得を開始する。
    func startUpdatingLocation() {
        manager.startUpdatingLocation()
    }

    func startMonitoring(spot: UnlockSpot) {
        stopMonitoring()
        monitoredSpot = spot
        manager.startMonitoring(for: spot.region())
        // 起動直後の初期状態確定のため、現在の在圏状態を問い合わせる。
        manager.requestState(for: spot.region())
    }

    func stopMonitoring() {
        for region in manager.monitoredRegions {
            manager.stopMonitoring(for: region)
        }
        monitoredSpot = nil
    }

    // MARK: - CLLocationManagerDelegate

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        authorizationStatus = manager.authorizationStatus
    }

    func locationManager(_ manager: CLLocationManager,
                         didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        DispatchQueue.main.async { self.currentLocation = latest }
    }

    func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == monitoredSpot?.id else { return }
        updateInside(true)
    }

    func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == monitoredSpot?.id else { return }
        updateInside(false)
    }

    func locationManager(_ manager: CLLocationManager,
                         didDetermineState state: CLRegionState,
                         for region: CLRegion) {
        guard region.identifier == monitoredSpot?.id else { return }
        updateInside(state == .inside)
    }

    private func updateInside(_ isInside: Bool) {
        DispatchQueue.main.async {
            self.insideSpot = isInside
            self.onRegionChange?(isInside)
        }
    }
}
