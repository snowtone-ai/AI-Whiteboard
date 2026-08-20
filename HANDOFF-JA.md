# AI Whiteboard 引き継ぎ

最終更新: 2026-08-20

## 現在地

個人・家族向けWindows完成版 v1 を `feat/complete-ai-whiteboard` に実装済み。
次の実装者は `CLAUDE.md` → `docs/state.md` → `docs/issues.md` → `tasks.md` の順で読み、
PR/CIと、資格情報が必要な実プロバイダー疎通の結果を確認する。

## 完成版 v1 の境界

Windows デスクトップ、Excalidraw(MIT)キャンバス、OpenAI/Anthropic/Gemini adapter、
AWCP Context Capsule、Context Lens、領域送信、履歴再生、意味抽出、音声入力、提案編集
（accept/reject/provenance）、export/import、atomic 保存と crash recovery を含める。
アカウント、クラウド共同編集、常時 telemetry は既定で持たない。ブラウザ/mobile は
v1 外とする。

## 開始コマンド

```powershell
pnpm install
pnpm setup
pnpm verify
```

`verify` はlint、型検査、22件のテスト、プロダクションビルドをまとめて実行する。
配布時は `pnpm dist` でNSISインストーラーを作る。

## 実装済み

- ローカル自動保存、atomic write、バックアップ復旧、`safeStorage`秘密情報保管
- Excalidraw、Context Lens/AWCP、意味抽出、音声、AIストリーム、提案の確認適用
- 履歴再生、セッション/PNG/SVG/PDF/Markdown/JSON/Context Capsule入出力
- Quick/Full/Dock/Inspect、グローバルショートカット、縮小動作配慮

## 残る運用確認

- APIキーをリポジトリに置いていないため、3社への実リクエストは未実施。
- インストーラーは個人利用向けの未署名ビルド。家族外へ配布する場合はコード署名する。
- `pnpm audit --prod` は既知脆弱性0件。Excalidrawの推移依存は`pnpm.overrides`で安全版へ固定。

## Owner handoff

- Branch: `feat/complete-ai-whiteboard`
- Ledger owner: main agent（`tasks.md`）
- Current blocker: none.
