/**
 * cross-origin の URL を確実にダウンロードする。
 *
 * `<a download href={crossOriginUrl}>` の `download` 属性は **cross-origin URL では無視され**、
 * クリックすると遷移（画像を開く）してしまう。S3 など別オリジンの画像をダウンロードさせるには
 * fetch → blob → object URL（same-origin）経由で `<a download>` を発火させる必要がある。
 * 対象オリジン側に CORS(GET) が必要。
 */
export const downloadFile = async (url: string, filename: string): Promise<void> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`download failed: ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement("a")
    anchor.download = filename
    anchor.href = objectUrl
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
