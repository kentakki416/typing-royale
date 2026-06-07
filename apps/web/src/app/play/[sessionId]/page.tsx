import { PlayScreen } from "./play-screen"

/**
 * プレイ画面のルート
 * 認証は proxy.ts で振り分け済み。session_id を Client Component に渡すだけ
 */
export default async function PlayPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  return <PlayScreen sessionId={sessionId} />
}
