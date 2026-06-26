/**
 * TEMP: error.tsx のスクショ取得用（preview で 500 を誘発する）。スクショ後に削除する。
 * force-dynamic でビルド時プリレンダーを避け、リクエスト時にだけ throw する。
 */
export const dynamic = "force-dynamic"

export default function ErrorPreview() {
  throw new Error("preview: intentional 500 for error.tsx screenshot")
}
