# AI Whiteboard design tokens

This is the executable token registry for `scripts/verify.mjs`. Product rationale and
usage guidance remain in [docs/design-system.md](docs/design-system.md).

## Registered tokens

| Category | Tokens |
|---|---|
| Color | `#182027`, `#295BFF`, `#FF6B4A`, `#F7F8F4`, `#DDE3EA`, `#11181D`, `transparent`, `currentColor`, `inherit`, `white`, `black` |
| Spacing | `0`, `1px`, `2px`, `4px`, `6px`, `8px`, `10px`, `12px`, `14px`, `16px`, `20px`, `24px`, `28px`, `32px`, `40px`, `48px`, `64px` |
| Radius | `0`, `2px`, `4px`, `6px`, `8px`, `12px`, `999px` |
| Motion | `0ms`, `80ms`, `120ms`, `160ms` |

## Design Token Rule

Changed renderer files must use CSS custom properties or one of the registered values above.
The raw-value lint checks added diff lines only, so it preserves pre-v12.1 styles while
preventing unregistered values from entering future changes.
