# スマートウォーク

依存系アプリを、指定した解除スポット（スーパー等）に到着するまでロックする
デジタルデトックス × 外出促進アプリ。

## このディレクトリの中身

| パス | 内容 |
|---|---|
| `SPEC.md` | 企画書・仕様書（成果物1） |
| `ios/` | iOSアプリ実装の雛形（成果物2）。組み立て手順は `ios/SETUP.md` |
| `prototype/` | ブラウザで動くGPS到着判定プロトタイプ（成果物3） |

## プロトタイプの動かし方

### A. スマホで開く（PWA / 推奨）

GitHub Pages で配信し、iPhoneのSafariで開ける。初回だけリポジトリ設定が必要:

1. GitHub → リポジトリ → Settings → Pages
2. 「Build and deployment」→ Source を **GitHub Actions** に設定
3. `claude/bold-hypatia-qNjbv` への push で自動デプロイ（`.github/workflows/deploy-pages.yml`）
4. 公開URL: **https://kazoooooooooooooooooman.github.io/-/**
5. iPhoneのSafariでそのURLを開き、共有ボタン →「ホーム画面に追加」で
   アプリのように起動できる（`manifest.json` + `sw.js` でPWA化済み）

### B. Macのローカルで開く

```
cd smart-walk/prototype
python3 -m http.server 8000
```

ブラウザで http://localhost:8000 を開く。位置情報の許可が必要（HTTPS または
localhost でないとブラウザが Geolocation を拒否する）。

## 注意

- iOSアプリの核心機能には Apple の Family Controls エンタイトルメント承認が必須。
  詳細は `SPEC.md` の第5章を参照。
- このリポジトリは元々 USD/JPY ダッシュボードのため、本アプリは `smart-walk/`
  配下に分離している。本格開発時は別リポジトリへの切り出しを推奨。
