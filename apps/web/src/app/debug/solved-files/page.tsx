import { extractRepoAndPathFromGithubUrl } from "@/libs/github-source-url"

/**
 * 一時 debug ページ（PR スクショ用）。
 * リザルト画面に追加した「今回解いたファイル」カードを mock data で render する。
 * 各問題の source_url から OSS のファイルパスを表示する。スクショ取得後に削除する。
 */
const SOLVED = [
  {
    function_name: "Feature",
    id: 1,
    source_url:
      "https://github.com/excalidraw/excalidraw/blob/abc/dev-docs/src/components/Homepage/index.tsx#L45-L57",
  },
  {
    function_name: "format",
    id: 2,
    source_url: "https://github.com/microsoft/vscode/blob/abc/src/vs/base/common/strings.ts#L132-L140",
  },
  {
    function_name: "observe",
    id: 3,
    source_url: "https://github.com/vuejs/vue/blob/abc/src/core/observer/index.ts#L20-L35",
  },
]

export default function DebugSolvedFiles() {
  return (
    <div className="container container-narrow">
      <div className="card mb-16">
        <div className="card-header">
          <div className="card-title">
            <span style={{ marginRight: "8px" }}>📂</span>今回解いたファイル（{SOLVED.length}）
          </div>
        </div>
        <div style={{ display: "grid", gap: "8px" }}>
          {SOLVED.map((problem, index) => {
            const meta = extractRepoAndPathFromGithubUrl(problem.source_url)
            return (
              <a
                className="text-sm flex-between"
                href={problem.source_url}
                key={problem.id}
                rel="noreferrer noopener"
                style={{ alignItems: "baseline", gap: "8px" }}
                target="_blank"
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <span className="text-muted">{index + 1}.</span>{" "}
                  {meta !== null ? (
                    <>
                      📦 {meta.repo} / <span className="text-mono">{meta.path}</span>
                      {meta.lineRange !== null && (
                        <span className="text-muted">:{meta.lineRange}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-mono">{problem.function_name}</span>
                  )}
                </span>
                <span className="text-muted" style={{ flexShrink: 0 }}>↗</span>
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
