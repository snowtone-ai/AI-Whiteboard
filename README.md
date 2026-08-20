# AI Whiteboard

個人・家族向けの、Windowsデスクトップ用ローカルファーストAIホワイトボードです。
技術設計と教育／STEMの両方を同じキャンバスで扱えます。描画はExcalidraw、AI文脈は
プロバイダー非依存のAWCP（AI Whiteboard Context Protocol）で表現し、AIによる変更は
必ず提案として確認してから適用します。

## 主な機能

- 手書き、図形、コネクター、テキスト、画像、グループ、Undo/Redoを備えた無限キャンバス
- セッション検索、ローカル自動保存、原子的保存、バックアップからの起動時復旧、履歴再生
- 選択範囲、画像、構造化オブジェクト、操作履歴を送信前に選べるContext Lens
- OpenAI、Anthropic、Google Geminiのストリーミングアダプターと正規化エラー
- OS暗号化領域（Electron `safeStorage`）に保存するAPIキー
- 意味オブジェクト／関係／根拠／confidenceを保持するContext Capsule
- AI編集のプレビュー、出典・モデル・capsule hash表示、適用／却下
- 日本語音声入力、Quick／Full／Dock／Inspect表示、グローバルショートカット
- セッション、PNG、SVG、PDF、Markdown、Excalidraw JSON、Context Capsuleの入出力
- アカウント、バックエンド、クラウド同期、テレメトリーなし

## 必要環境

- Windows 11
- Node.js 22.12以上
- pnpm 10.12.1

```powershell
pnpm install
pnpm setup
pnpm dev
```

`Ctrl+Shift+Space`でウィンドウを呼び出せます。設定画面で利用するプロバイダーとモデルを
選び、APIキーを保存してください。キーを設定しなくても描画、保存、履歴、書き出しは
すべてオフラインで使えます。

## 検証と配布

```powershell
pnpm verify
pnpm dist
```

`pnpm verify`は構造チェック、lint、型検査、単体／契約テスト、プロダクションビルドを実行します。
Windowsインストーラーは`release/AI-Whiteboard-1.0.0-Setup.exe`に生成されます。

## データとプライバシー

ボード、スナップショット、イベントはElectronの`userData`配下へ保存されます。APIキーは
別ファイルへ暗号化して保存され、renderer、ボードJSON、履歴、書き出しには含めません。
ネットワーク通信はユーザーがAIへ送信したときだけ発生します。送信前にContext Lensで
対象を確認してください。子どもの個人情報、秘密のコード、認証情報は送信対象から外す運用を
推奨します。

## 構成

- `apps/desktop/src/main`: Electron、保存、秘密情報、AIアダプター、IPC
- `apps/desktop/src/preload`: 最小権限の型付きブリッジ
- `apps/desktop/src/renderer`: React UI、Excalidraw、Context Lens、提案、履歴、書き出し
- `packages/core`: AWCP、capsule、semantic extraction、diff／patch／replay、領域、privacy
- `docs`: ビジョン、意思決定、競合調査、デザイン、実行台帳

ライセンスはMITです。競合・ライセンス・モデルの調査根拠は
[`docs/product-research.md`](docs/product-research.md)を参照してください。
