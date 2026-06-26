/**
 * 言語マスタが空のときの空状態。
 * 言語マスタは migration で必ず投入されるため通常は表示されないが、
 * API 障害・空 DB の防御として用意する（各画面で 500 にしないため）。
 */
export function EmptyLanguagesState() {
  return (
    <div className="card text-center" style={{ padding: "48px 16px" }}>
      <div className="mb-8">対応言語が準備中です</div>
      <div className="text-sm text-muted">しばらくしてから再度お試しください。</div>
    </div>
  )
}
