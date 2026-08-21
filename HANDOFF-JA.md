# AI Whiteboard 引き継ぎ

最終更新: 2026-08-21

## 現在地

Electronデスクトップアプリ版（`feat/complete-ai-whiteboard`、タグ`archive/desktop-v1`）から
方向転換し、ChatGPTのチャット入力欄にホワイトボードを追加するChrome拡張機能（MV3）として
`feat/browser-input-method`に実装済み。経緯は`docs/decisions.md`のD-009〜D-013を参照。
次の実装者は`CLAUDE.md` → `docs/state.md` → `docs/issues.md` → `tasks.md`の順で読み、
`docs/adapter-smoke.md`の手動検証結果を確認する。

## v1 の境界（ChatGPTのみ）

入力欄横のランチャーボタン → ホワイトボードのオーバーレイ表示 → 「送信」で白背景PNG＋
描画順のテキスト要約を入力欄に挿入 → ユーザー自身がChatGPTの送信ボタンを押す。
**自動送信・AI応答の読み取りは一切行わない**（D-013、ハード制約）。APIキーの保存や
AIプロバイダーへの直接アクセスはない。Claude/Gemini対応は次フェーズ（`tasks.md` P007/P008）。

## 開始コマンド

```powershell
pnpm install
pnpm run setup
pnpm verify
```

`verify`はlint、型検査、18件のテスト、拡張機能ビルド（esbuild）をまとめて実行する。
Chromeへの読み込みは`pnpm build`後、`chrome://extensions`で`apps/extension/dist/`を
「パッケージ化されていない拡張機能」として読み込む。

## pm-zero v12.1 運用層

- `node scripts/setup.mjs` はUIを検出し、Impeccableをローカルにのみ導入し、
  `.mcp.json` に Chrome DevTools MCP を登録する。生成スキルは Git 管理しない。
- `DESIGN.md` は `verify` のデザイントークン登録簿。変更したフロントエンド行に
  未登録の色・寸法・モーション値を追加すると検証が失敗する。

## 実装済み

- `apps/extension/src/content/`: ランチャーボタンのマウント、位置追従、オーバーレイ開閉
- `apps/extension/src/content/adapters/chatgpt.ts`: 入力欄・ファイル添付欄のカスケード検出
- `apps/extension/src/content/insert/`: ファイル添付 → クリップボードフォールバックの挿入
- `apps/extension/src/board/`: Excalidrawボード（`chrome-extension://`ページとして独立実行）、
  白背景PNG書き出し、描画順の構造化テキスト要約（`summarize.ts`、単体テスト5件）

## 残る運用確認

- **本環境からは実ブラウザでのライブ検証ができない。** `docs/adapter-smoke.md`のチェックリストを
  ログイン済みChromeで手動実行し、結果を記録すること。これがP006の完了条件。
- `packages/core`は現在未使用（休眠）。旧デスクトップ版のドメインロジックで、
  Context Lensを本格的に作り込む際に再利用する可能性がある（D-011/D-012）。
- Claude/Geminiアダプターは、ChatGPT版のライブ検証が済んでから着手する（`tasks.md`参照）。

## Owner handoff

- Branch: `feat/browser-input-method`（旧版は`archive/desktop-v1`タグに保存）
- Ledger owner: main agent（`tasks.md`）
- Current blocker: none（ライブ検証待ちのみ。`docs/issues.md`参照）
