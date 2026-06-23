# feather — Audio Annotation Dashboard (prototype)

micro1 / Mercor / Scale 型の **音声アノテーション・ダッシュボード**のプロトタイプ。
共有された本物の DOM 構造(React + MUI + Radix Tabs + react-resizable-panels +
`hdk-` 接頭辞のデザインシステム)を読み取り、**ビルド不要の素のHTML/CSS/JS**で再現したもの。

## 使い方

`feather/index.html` をブラウザで直接開くだけ。サーバ不要。

## できること

- **波形タイムライン**:疑似波形を描画し、再生位置をプレイヘッドで同期
- **チャンク分割**:波形上を**ドラッグ**して区間(segment)を作成、クリックで選択
- **3タブのラベリング**(本物と同じ構成):
  - `Speakers` — 話者 + 書き起こし
  - `Emotion` — 主感情 + 強度(1〜5)
  - `Vocal Delivery` — 発話スタイル + メモ
- **Segments 一覧**:全区間とラベルをタグ表示、行から削除
- **納品プレビュー**:ラベルを**Delivery JSON**としてリアルタイム生成(相手企業へ渡すスキーマ)
- **タスクキュー**(左ペイン):複数音声タスクの切り替え、todo/review/done ステータス
- **キーボードショートカット**:Space 再生 / E 区切り / Del 削除 / ←→ 移動 / 1·2·3 タブ
- **リサイズ可能なサイドバー**(本物の resize-handle を再現)

## 本番に向けた発展ポイント

このプロトは UI の再現が目的。実運用化するなら:

| 層 | プロト | 本番 |
|---|---|---|
| 波形 | canvas で疑似生成 | **WaveSurfer.js** + 実音声 |
| 保存 | メモリのみ | **FastAPI + PostgreSQL** |
| 音声 | なし | **S3 + 署名付きURL** |
| 連携 | alert で模擬 | 取り込みAPI / 納品 **Webhook** |
| 認証 | なし | APIキー / OAuth / 監査ログ |

## 納品 JSON スキーマ(相手企業との契約面)

```json
{
  "task_id": "task_0481",
  "audio_file": "call_audio.wav",
  "duration_sec": 42.5,
  "sample_rate": 16000,
  "channels": 1,
  "schema_version": "1.0",
  "segments": [
    { "index": 1, "start": 1.2, "end": 6.8,
      "speaker": "Agent", "transcript": "...",
      "emotion": "neutral", "emotion_intensity": 2,
      "vocal_delivery": "calm", "notes": null }
  ]
}
```
