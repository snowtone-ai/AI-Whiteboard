# AI Whiteboard

ChatGPTのチャット入力欄の横にホワイトボードを追加する、Chrome拡張機能です。文章より図で
伝えたいときに、ボタン一つでホワイトボードを開いて描き、その内容をチャットの入力欄に送れます。
AIとの会話自体はChatGPT側（ご自身のアカウント・契約）でそのまま行われます。本拡張機能はAI
プロバイダーのAPIを直接呼び出しません。

以前のバージョン（Electronデスクトップアプリ）は`archive/desktop-v1`タグに保存されています。
現在の設計に至った経緯は[`docs/decisions.md`](docs/decisions.md)のD-009以降を参照してください。

## 使い方

1. 下記の手順でビルドし、Chromeに読み込む。
2. chatgpt.comを開く（ログイン状態で）。
3. 入力欄の横に現れる ✎ ボタンをクリックしてホワイトボードを開く。
4. 描く。
5. 「送信」を押す。画像（白背景PNG）と、描いた順番がわかる短いテキスト説明が入力欄に入る。
6. 内容を確認し、**ChatGPT自身の送信ボタンを押す**。本拡張機能が自動送信することはない。

セレクタが壊れて自動添付ができない場合は、画像をクリップボードにコピーし、
「Ctrl+Vで貼り付けてください」と表示する（詳細は[`docs/adapter-smoke.md`](docs/adapter-smoke.md)）。

## 必要環境

- Windows 11 + Chrome（Chromium系ブラウザなら動作する可能性が高いが未検証）
- Node.js 22.12以上
- pnpm 10.12.1

## ビルドと読み込み

```powershell
pnpm install
pnpm run setup
pnpm build
```

`apps/extension/dist/`が生成される。Chromeで`chrome://extensions`を開き、デベロッパーモードを
有効にして「パッケージ化されていない拡張機能を読み込む」から`apps/extension/dist/`を選択する。

開発中はビルドの監視モードが使える。

```powershell
pnpm dev
```

## 検証

```powershell
pnpm verify
```

`pnpm verify`はlint、型検査、単体テスト、拡張機能のビルドを実行する。サイトのDOM構造に依存する
部分（入力欄の検出など）はCIで検証できないため、`docs/adapter-smoke.md`のチェックリストに沿って
手動で確認し、確認日を記録する運用にしている。

## データとプライバシー

APIキーは保存しない（保存する必要がない — AIプロバイダーへの直接アクセスがないため）。通信は
発生しない。ホワイトボードの内容は拡張機能のiframe内でのみ扱われ、送信先はユーザーが今開いて
いるChatGPTのページの入力欄のみ。アカウント、バックエンド、テレメトリーはなし。

## 構成

- `apps/extension/src/content/`: ChatGPTのページ上で動くランチャーボタンとDOM挿入処理
- `apps/extension/src/content/adapters/`: サイトごとのDOM検出（現在ChatGPTのみ）
- `apps/extension/src/board/`: ホワイトボード本体（`chrome-extension://`ページとして独立実行）
- `packages/core/`: 旧デスクトップ版のドメインロジック（現在未使用、休眠中）
- `docs/`: ビジョン、意思決定、アダプター検証ログ、実行台帳

ライセンスはMITです。
