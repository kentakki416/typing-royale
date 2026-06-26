/**
 * TEMP: error.tsx のスクショ取得用（preview で 500 を誘発する）。スクショ後に削除する。
 */
export default function ErrorPreview() {
  throw new Error("preview: intentional 500 for error.tsx screenshot")
}
