import type { Metadata } from "next"
import Link from "next/link"

import type { GetFeaturedReplaysResponse } from "@repo/api-schema"

import { Topbar } from "@/components/topbar"
import { apiClient } from "@/libs/api-client"

export const metadata: Metadata = {
  title: "Typing Royale",
}

const LANGUAGE_LABEL: Record<string, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
}

const truncate = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

/**
 * トップ画面（mock: top.html 準拠の landing）
 *
 * 主な要素:
 * - hero（タイトル + CTA 2 つ）
 * - god-frame card（神々に挑戦の紹介）
 * - 注目のリプレイ（Hall of Fame コメント駆動の featured 3 件）
 * - 全期間トップランキング preview（Phase 4 まで placeholder）
 * - 「なぜ Typing Royale か」3 col 説明
 * - sidebar に統計 placeholder + 対応言語バッジ
 *
 * 「言語選択 → プレイ開始」自体は /play に分離している（mock 構成と同じ）
 */
export default async function HomePage() {
  const featured = await apiClient
    .get<GetFeaturedReplaysResponse>("/api/replays/featured?limit=3")
    .catch(() => ({ items: [] }))

  return (
    <>
      <Topbar active="home" />

      <div className="hero">
        <h1>
          <span
            style={{
              background: "linear-gradient(135deg, #fff0a8 0%, #ffd54a 35%, #e6b422 65%, #a07014 100%)",
              backgroundClip: "text",
              filter: "drop-shadow(0 2px 0 rgba(0, 0, 0, 0.45)) drop-shadow(0 0 18px rgba(255, 213, 74, 0.55))",
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

            {featured.items.length > 0 && (
              <div className="card mb-24">
                <div className="card-header">
                  <div className="card-title">✨ 注目のリプレイ</div>
                  <Link className="text-sm" href="/hall-of-fame">殿堂入り →</Link>
                </div>
                <div className="row gap-16" style={{ flexWrap: "wrap" }}>
                  {featured.items.map((item) => (
                    <div className="col" key={item.play_session_id} style={{ minWidth: "220px" }}>
                      <div className="card" style={{ height: "100%" }}>
                        <div className="flex-center gap-12 mb-8">
                          <FeaturedAvatar
                            avatarUrl={item.player.avatar_url}
                            displayName={item.player.display_name}
                          />
                          <div>
                            <div className="player-name">@{item.player.display_name}</div>
                            <div className="text-xs text-muted">
                              {LANGUAGE_LABEL[item.language] ?? item.language} · {item.stats.score.toLocaleString()} pts
                            </div>
                          </div>
                        </div>
                        <div
                          className="text-sm text-muted mb-8"
                          style={{ minHeight: "48px" }}
                        >
                          「{truncate(item.comment, 60)}」
                        </div>
                        <Link
                          className="btn btn-primary"
                          href={`/replay/${item.play_session_id}`}
                        >
                          ▶ 視聴する
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card mb-24">
              <div className="card-header">
                <div className="card-title">🏆 全期間トップ</div>
                <Link className="text-sm" href="/ranking">すべて見る →</Link>
              </div>
              <p className="text-sm text-muted text-center mb-16" style={{ padding: "24px 0" }}>
                ランキング preview は Phase 4 (score-ranking) で本表示します。
              </p>
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
              <div className="card-header"><div className="card-title">統計</div></div>
              <p className="text-sm text-muted">
                各種カウンタは Phase 4 / 9 で本表示します。
              </p>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">対応言語</div></div>
              <div className="flex gap-8" style={{ flexWrap: "wrap" }}>
                <span className="badge accent">TypeScript</span>
                <span className="badge warning">JavaScript</span>
                <span className="badge">Python (近日)</span>
                <span className="badge">Go (近日)</span>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <div className="footer">
        <a href="#">利用規約</a> · <a href="#">プライバシー</a> · <a href="#">ライセンス一覧</a>
      </div>
    </>
  )
}

const FeaturedAvatar = ({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) => {
  const initials = displayName.slice(0, 2).toUpperCase()
  if (avatarUrl === null) {
    return <span className="avatar">{initials}</span>
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img alt={displayName} className="avatar" src={avatarUrl} />
  )
}
