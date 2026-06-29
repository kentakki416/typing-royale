type Props = {
  icon: string
  subtitle: string
  title: string
}

/**
 * 一覧系ページ共通の中央寄せヒーローヘッダー。
 *
 * 殿堂入り（/hall-of-fame）のヘッダー表現（大きな絵文字アイコン + タイトル +
 * 補足テキスト）を、ランキング（/ranking）・リポジトリ（/crawled-repos）でも
 * 流用して見た目を統一する。データ件数や対象月などのページ固有メタ情報は
 * subtitle に流し込む。
 */
export function PageHero({ icon, subtitle, title }: Props) {
  return (
    <div className="text-center mb-24">
      <div style={{ fontSize: "56px" }}>{icon}</div>
      <h1>{title}</h1>
      <p className="text-muted">{subtitle}</p>
    </div>
  )
}
