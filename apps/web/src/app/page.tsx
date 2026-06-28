import type { Metadata } from "next"
import Link from "next/link"

import type { GetMonthlyRankingsResponse } from "@repo/api-schema"

import { AdUnit } from "@/components/ads/ad-unit"
import { CrawledReposSection } from "@/components/crawled-repos-section"
import { MissedRewardsPopup } from "@/components/missed-rewards-popup"
import { MonthlyByLanguage, MonthlyTopSection } from "@/components/monthly-top-section"
import { PendingRewardsPopup } from "@/components/pending-rewards-popup"
import { Topbar } from "@/components/topbar"
import { env } from "@/env"
import { apiClient } from "@/libs/api-client"
import { getAccessToken } from "@/libs/auth"
import { getLanguages } from "@/libs/languages"

/** API 失敗時のフォールバック（year_month が空のとき MonthlyTopCard は「集計準備中」を出す） */
const EMPTY_MONTHLY: GetMonthlyRankingsResponse = { entries: [], year_month: "" }

export const metadata: Metadata = {
  title: "Typing Royale",
}

/**
 * トップ画面（mock: top.html 準拠の landing）
 *
 * 主な要素:
 * - hero（タイトル + CTA 2 つ）
 * - god-frame card（神々に挑戦の紹介）
 * - 月間トップ（TypeScript / JavaScript の当月 TOP 5 を並列 fetch）
 * - 「なぜ Typing Royale か」3 col 説明
 * - sidebar に統計 placeholder + 対応言語バッジ
 *
 * 「言語選択 → プレイ開始」自体は /play に分離している（mock 構成と同じ）
 */
export default async function HomePage() {
  const accessToken = await getAccessToken()
  const isAuthed = accessToken !== null
  const languages = await getLanguages()

  /**
   * 言語マスタごとに当月 TOP 5 を並列 fetch する（言語タブはマスタ由来）
   */
  const monthlyByLanguage: MonthlyByLanguage[] = await Promise.all(
    languages.map(async (language) => ({
      language,
      monthly: await apiClient
        .get<GetMonthlyRankingsResponse>(
          `/api/rankings/monthly?language=${language.slug}&limit=5`,
        )
        .catch(() => EMPTY_MONTHLY),
    })),
  )

  return (
    <>
      <Topbar active="home" isAuthed={isAuthed} />

      <div className="hero">
        <h1>
          <span
            style={{
              background: "linear-gradient(135deg, #fffae6 0%, #ffeb80 30%, #ffd54a 65%, #f5c000 100%)",
              backgroundClip: "text",
              filter: "drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45)) drop-shadow(0 0 22px rgba(255, 224, 102, 0.75))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Typing Royale
          </span>
          <br />
          Type real <span className="accent">OSS code</span>.
        </h1>
        <p>
          OSS の実コードを 120 秒で打鍵するエンジニア向けタイピングゲーム。スコアに応じて
          README に貼れる動的バッジ・達成カードがもらえる。
        </p>
        <div className="flex-center gap-12 mt-24" style={{ justifyContent: "center" }}>
          <Link className="btn btn-primary btn-play btn-large" href="/play">▶ プレイ開始</Link>
          <Link className="btn btn-large" href="/sign-in">GitHub で記録を残す</Link>
        </div>
        <div className="text-sm text-muted mt-16">
          ログインなしでも遊べます · 記録を残したいときだけ GitHub 連携
        </div>
      </div>

      <div className="container">
        <div className="row">
          <div className="col">
            <div className="card god-frame mb-24">
              <div className="card-header">
                <div
                  className="card-title"
                  style={{
                    color: "var(--gold-light)",
                    textShadow: "0 1px 0 rgba(0,0,0,0.5), 0 0 16px rgba(255, 213, 74, 0.5)",
                  }}
                >
                  ⚡ 神々に挑戦モード
                </div>
                <span className="badge gold">特別モード</span>
              </div>
              <div className="flex-between" style={{ alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <p className="text-sm">
                    殿堂入りしたユーザーの中から <strong>ランダムに 1 人</strong> を選定して、そのユーザーに挑戦できます。
                  </p>
                </div>
                <Link className="btn btn-gold" href="/play">挑戦する →</Link>
              </div>
            </div>

            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">🏆 月間トップ</div>
                <Link className="text-sm" href="/ranking">月間ランキング →</Link>
              </div>
              <MonthlyTopSection items={monthlyByLanguage} />
            </div>

            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">なぜ Typing Royale か</div>
              </div>
              <div className="row gap-16">
                <div className="col">
                  <h3>📦 リアル OSS のコード</h3>
                  <p className="text-sm text-muted">
                    週次クローラが GitHub Star 上位の寛容ライセンス OSS から AST で
                    関数を自動抽出。手で選別されたカスタム問題ではないリアル。
                  </p>
                </div>
                <div className="col">
                  <h3>🏆 言語別ランキング</h3>
                  <p className="text-sm text-muted">
                    言語ごとの全期間トップ。リプレイ視聴と「神々に挑戦」モードで観戦も可能。
                  </p>
                </div>
                <div className="col">
                  <h3>✨ GitHub に映える特典</h3>
                  <p className="text-sm text-muted">
                    動的 SVG バッジ・達成カード・殿堂入り。
                    README が豪華になる。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <aside className="col-sidebar">
            <div className="card mb-16">
              <div className="card-header">
                <div className="card-title">📦 クロール対象リポジトリ</div>
              </div>
              <CrawledReposSection languages={languages} />
            </div>

            <div className="card mb-16">
              <div className="card-header"><div className="card-title">対応言語</div></div>
              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                <span className="badge accent">TypeScript</span>
                <span className="badge warning">JavaScript</span>
                <span className="badge success">Go</span>
                <span className="badge pink">Python (近日)</span>
              </div>
            </div>

            {/* サイドバー広告（対応言語カードの下 / 280px 列で自然と小さめ / 未設定時は非表示） */}
            <AdUnit minHeight={200} slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME_SIDEBAR ?? ""} />
          </aside>
        </div>
      </div>

      {/* メインカラム下部の大型バナー広告（幅広コンテナ / 未設定時は非表示 / プレイ画面には置かない） */}
      <div className="container" style={{ marginTop: 32 }}>
        <AdUnit minHeight={280} slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_HOME ?? ""} />
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="/privacy">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>

      {/* リザルト → ホーム遷移時の pending rewards 通知 (special-badges step5) */}
      <PendingRewardsPopup apiUrl={env.API_URL} />
      {/* タブ閉じ→再訪などで取りこぼした完成済み reward の救済 (rewards-worker step4) */}
      {isAuthed && <MissedRewardsPopup apiUrl={env.API_URL} />}
    </>
  )
}
