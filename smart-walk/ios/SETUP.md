# iOSアプリ 組み立て手順

`.xcodeproj` は環境ごとに署名情報が変わり手書き生成が壊れやすいため、
ソースファイルのみ用意している。以下の手順でXcode上で組み立てる。

## 前提

- Mac + Xcode 15 以降
- Apple Developer Program 登録済み（登録済みとのこと）
- 実機（Family Controls はシミュレータでは動作しない）

## 1. プロジェクト作成

1. Xcode → New Project → iOS App
2. Product Name: `SmartWalk` / Interface: SwiftUI / Language: Swift
3. Deployment Target: iOS 16.0

## 2. ソースの取り込み

`ios/SmartWalk/` の `.swift` 6ファイルをアプリターゲットに追加:
`SmartWalkApp.swift` `AppModel.swift` `AuthorizationManager.swift`
`RestrictionManager.swift` `LocationManager.swift` `ContentView.swift` `UnlockSpot.swift`
（自動生成された `ContentView.swift` `SmartWalkApp.swift` は置き換える）

## 3. Capability 追加（アプリターゲット）

- **Family Controls** を追加
- **App Groups** を追加し `group.com.example.smartwalk` を作成
  （`AppModel.swift` の `AppGroup.identifier` と一致させる。Bundle ID に合わせて変更可）
- **Background Modes** → Location updates にチェック

`SmartWalk.entitlements` を参考に値を合わせる（Bundle ID変更時は App Group 名も統一）。

## 4. Info.plist キー

| キー | 値（例） |
|---|---|
| `NSLocationWhenInUseUsageDescription` | 解除スポットへの到着を判定するために位置情報を使用します |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | 帰宅後の自動再ロックのため、バックグラウンドでも位置情報を使用します |
| `UIBackgroundModes` | `location` |

## 5. App Extension ターゲットを2つ追加

### DeviceActivityMonitor 拡張
- File → New → Target → **Device Activity Monitor Extension**
- 生成ファイルを `ios/DeviceActivityMonitorExtension/DeviceActivityMonitorExtension.swift` で置換
- この拡張ターゲットにも **App Groups**（同じID）と **Family Controls** を追加

### ShieldConfiguration 拡張
- File → New → Target → **Shield Configuration Extension**
- 生成ファイルを `ios/ShieldConfigurationExtension/ShieldConfigurationExtension.swift` で置換
- この拡張ターゲットにも **Family Controls** を追加

## 6. 実機ビルドと動作確認

1. 実機を接続し、自分のチームで署名
2. 起動 → 「スクリーンタイムを許可する」→ システムダイアログで承認
3. 「ロックするアプリを選ぶ」で対象アプリを選択
4. 解除スポットを選択
5. 対象アプリを開く → シールド画面が出ればロック成功
6. 到着テストは Xcode の Debug → Simulate Location、または実際にスポットへ移動

## 7. 配布前にやること

- `com.apple.developer.family-controls` の **Distribution** エンタイトルメントを
  Apple に申請・承認（`../SPEC.md` 第5章）。承認前は TestFlight 含め配布ビルド不可。
- Bundle ID / App Group / チームIDを本番用に確定。

## 既知の制約・TODO（MVP段階の割り切り）

- スポットは `UnlockSpot.samples` のハードコード。本番はサーバー配信に置換。
- iOS の領域監視は同時20リージョンまで。スポット数増加時は現在地近傍のみ登録する設計が必要。
- 「帰宅で再ロック」は解除スポットの `didExitRegion` で代用。自宅ジオフェンスは未実装。
