import { GithubApiError } from "./errors"
import { parseRateLimit, waitForRateLimit } from "./rate-limit"
import type {
  GithubRepoMeta,
  GithubSearchItem,
  GithubSearchResult,
  GithubTreeEntry,
} from "./types"

const API_BASE = "https://api.github.com"
const RAW_BASE = "https://raw.githubusercontent.com"
const DEFAULT_USER_AGENT = "typing-royale-crawler/1.0"

const SEARCH_LICENSE_FILTER =
  "license:mit license:apache-2.0 license:bsd-3-clause license:isc"

/** AST 解析対象の拡張子（tree フィルタで使用） */
const TARGET_EXTENSIONS = /\.(ts|tsx|js|jsx)$/

/**
 * ファイルサイズの上限（バンドル済みファイル等を除外）。
 * 100KB を超えるソースは AST パースが重く、ノイズになりがちなので落とす。
 */
const MAX_FILE_SIZE = 100_000

/**
 * tree からダウンロードしない（≒ AST 解析対象外）のパスパターン。
 * ダウンロード前に除外することで GitHub API のレート消費と AST パースコストを抑える。
 */
const EXCLUDED_TREE_PATTERNS = [
  /** 依存・ビルド成果物 */
  /^node_modules\//,
  /\/node_modules\//,
  /^dist\//,
  /^build\//,
  /\.d\.ts$/,

  /** テストファイル（拡張子 / suffix） */
  /\.test\./,
  /\.spec\./,
  /[-_]test\.[jt]sx?$/,

  /** テストディレクトリ */
  /^(__tests__|tests?|e2e|cypress)\//,
  /\/(__tests__|tests?|e2e|cypress)\//,
  /^__mocks__\//,
  /\/__mocks__\//,

  /** ノイズ（実装ロジックではない） */
  /\.stories\.[jt]sx?$/,
  /\.fixtures?\./,

  /** 静的アセット / データ（ソースコードではない） */
  /^(data|images|public)\//,
  /\/(data|images|public)\//,
]

export type GithubClientConfig = {
  /**
   * GitHub Personal Access Token（public_repo スコープ想定）。
   * 空文字を渡せば未認証で叩くこともできるが、レート制限が IP 単位の 60 req/h に
   * 落ちるため実運用では必須。
   */
  pat: string
  /** Search Repositories API の `stars:>=` フィルタ値 */
  minStars: number
  /** Search Repositories API の `pushed:>` フィルタ値（YYYY-MM-DD）。省略時は実行日 - 2 年 */
  pushedAfter?: string
  userAgent?: string
}

/**
 * GitHub API クライアント
 *
 * REST API（api.github.com）と raw content（raw.githubusercontent.com）の双方を
 * 1 つの class に集約する。コンストラクタで PAT / User-Agent / Search のデフォルト
 * フィルタを受け取り、env への直接依存はここでは持たない（cli 側で env から組み立てる）。
 *
 * 提供メソッド:
 *   - searchRepos        : Search Repositories API
 *   - getRepoMeta        : Repos API + default branch の HEAD commit SHA
 *   - listSourceFiles    : Git Tree API + クロール用のファイル除外フィルタ
 *   - getRawContent      : raw.githubusercontent.com からのファイル本文取得
 *
 * 共通の fetch / ヘッダ / rate limit ハンドリングは private メソッドに閉じてあり、
 * 4xx は GithubApiError(status)、5xx・ネットワークエラーは GithubApiError(>=500) に
 * wrap して throw する（lib/retry.ts の retryWithBackoff がそれを 5xx 判定で拾う）。
 */
export class GithubClient {
  private readonly pat: string
  private readonly userAgent: string
  private readonly minStars: number
  private readonly pushedAfter: string

  constructor(config: GithubClientConfig) {
    this.pat = config.pat
    this.userAgent = config.userAgent ?? DEFAULT_USER_AGENT
    this.minStars = config.minStars
    this.pushedAfter = config.pushedAfter ?? this._defaultPushedAfter()
  }

  /**
   * 役割: クローラの「次に取り込む候補 repo を **探す**」フェーズ。
   *
   * GitHub Search Repositories API（`/search/repositories`）を叩く。まだ owner/name を
   * 知らない repo の中から、フィルタ条件にマッチするものをスター数降順で 100 件ずつ
   * 取得する。返るのはあくまでマッチ一覧のメタ subset で、ファイル本文や正確な license
   * を確定するには後段の getRepoMeta が必要。
   *
   * docs/spec/problem-pool/README.md「取得元の選定」のフィルタ条件:
   *   - language:{slug}
   *   - license:mit | license:apache-2.0 | license:bsd-3-clause | license:isc
   *   - stars:>={minStars}
   *   - pushed:>{pushedAfter}
   *   - archived:false
   *   - sort=stars-desc / per_page=100
   *
   * 入力: language（スラッグ）, page（1〜10）
   * 出力: { items: GithubSearchItem[], totalCount }
   */
  public searchRepos = async (language: string, page: number): Promise<GithubSearchResult> => {
    const q = `language:${language} ${SEARCH_LICENSE_FILTER} stars:>=${this.minStars} pushed:>${this.pushedAfter} archived:false`
    const url = `${API_BASE}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=100&page=${page}`
    const res = await this._fetch(url, this._apiHeaders())
    const json = (await res.json()) as { items: unknown[]; total_count: number }
    return {
      items: json.items.map(this._toSearchItem),
      totalCount: json.total_count,
    }
  }

  /**
   * 役割: 候補 repo の「**最新の正確なメタ情報** と **クロール起点となる commit SHA** を取る」フェーズ。
   *
   * 2 つの API を組み合わせる:
   *   1. Repos API（`/repos/{owner}/{name}`）で description / topics / license /
   *      default_branch を最新値で取得。Search の結果はインデックス時点の値なので、
   *      ここで取り直すことで「Search 時点では MIT だったが実は変わっていた」を防ぐ。
   *   2. Git Refs API（`/repos/{owner}/{name}/git/refs/heads/{branch}`）で default branch の
   *      HEAD commit SHA を取得。以降の tree / raw 取得はこの SHA に固定することで、
   *      クロール中に repo が変更されても整合性が崩れず、permalink URL も SHA 付きで作れる。
   *
   * 入力: owner, repo
   * 出力: GithubRepoMeta（最新メタ + commitSha）
   */
  public getRepoMeta = async (owner: string, repo: string): Promise<GithubRepoMeta> => {
    const url = `${API_BASE}/repos/${owner}/${repo}`
    const res = await this._fetch(url, this._apiHeaders())
    const json = (await res.json()) as {
      default_branch: string
      description: string | null
      full_name: string
      homepage: string | null
      id: number
      license: { spdx_id: string | null } | null
      name: string
      owner: { login: string }
      stargazers_count: number
      topics: string[] | undefined
    }
    const sha = await this._getCommitSha(owner, repo, json.default_branch)
    return {
      id: json.id,
      commitSha: sha,
      defaultBranch: json.default_branch,
      description: json.description,
      fullName: json.full_name,
      homepage: json.homepage,
      license: json.license?.spdx_id ?? null,
      name: json.name,
      owner: json.owner.login,
      stars: json.stargazers_count,
      /** GitHub は topics 未設定の repo で undefined を返すケースがある */
      topics: json.topics ?? [],
    }
  }

  /**
   * 役割: 「**どのファイルをダウンロードすべきか**」を決めるフェーズ。本文は取らない。
   *
   * Git Tree API（`/repos/{owner}/{name}/git/trees/{sha}?recursive=1`）を `recursive=1`
   * で叩き、その commit に含まれる全 blob のパスとサイズを 1 リクエストで取得する。
   * 戻り値はファイル本文を含まないので、ここで AST 対象（.ts/.tsx/.js/.jsx）に絞り、
   * テスト・ストーリーブック・静的アセット・大ファイル等を **ダウンロード前に除外** する。
   * これにより後段の getRawContent の呼び出し回数と AST パースコストを大きく削減できる。
   *
   * 入力: owner, repo, commitSha（getRepoMeta が返した SHA を使う）
   * 出力: AST 対象に絞った GithubTreeEntry[]
   */
  public listSourceFiles = async (
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<GithubTreeEntry[]> => {
    const url = `${API_BASE}/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`
    const res = await this._fetch(url, this._apiHeaders())
    const json = (await res.json()) as { tree: unknown[] }
    return json.tree
      .map(this._toTreeEntry)
      .filter((e): e is GithubTreeEntry => e !== null)
      .filter((e) => e.type === "blob")
      .filter((e) => TARGET_EXTENSIONS.test(e.path))
      .filter((e) => !EXCLUDED_TREE_PATTERNS.some((p) => p.test(e.path)))
      .filter((e) => (e.size ?? 0) <= MAX_FILE_SIZE)
  }

  /**
   * 役割: 「**AST に流し込むソースコード本文を 1 ファイルずつ取得する**」最終フェーズ。
   *
   * `raw.githubusercontent.com/{owner}/{name}/{sha}/{path}` から UTF-8 テキストで取得する。
   * commitSha 固定なので、後で repo が変更されても同じ内容が返る（永続的なソース参照）。
   * Tree API はファイル一覧しか返さないため、本文取得は **1 ファイル 1 リクエスト**になる
   * （これが GitHub クライアントで最もリクエスト数が多くなる箇所）。
   *
   * 認証は不要だが PAT を付けることでレート制限がアカウント単位（5000 req/h）になる。
   * 非認証だと IP 単位で 60 req/h と厳しいため、PAT は事実上必須。
   *
   * 入力: owner, repo, commitSha, path（listSourceFiles が返した path をそのまま使う）
   * 出力: ファイル本文（UTF-8 文字列）
   */
  public getRawContent = async (
    owner: string,
    repo: string,
    commitSha: string,
    path: string
  ): Promise<string> => {
    const url = `${RAW_BASE}/${owner}/${repo}/${commitSha}/${path}`
    const res = await this._fetch(url, this._rawHeaders())
    return res.text()
  }

  /**
   * 共通 fetch ヘルパ
   *
   * - レスポンスヘッダから rate limit を読み取り、necessary なら待機
   * - ネットワークエラー（fetch native の TypeError 等）は GithubApiError(599) に
   *   wrap して投げ直す。retryWithBackoff の「statusCode >= 500 ならリトライ」
   *   ルートに乗せるため
   * - HTTP 非 2xx は GithubApiError(status) として throw（4xx は呼び出し側で
   *   disable 判断、5xx はリトライへ）
   */
  private _fetch = async (
    url: string,
    headers: Record<string, string>
  ): Promise<Response> => {
    let res: Response
    try {
      res = await globalThis.fetch(url, { headers })
    } catch (err) {
      throw new GithubApiError(599, String(err))
    }

    const rateLimit = parseRateLimit(res.headers)
    if (rateLimit) await waitForRateLimit(rateLimit)

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new GithubApiError(res.status, body)
    }
    return res
  }

  private _apiHeaders = (): Record<string, string> => ({
    "Accept": "application/vnd.github+json",
    "Authorization": `Bearer ${this.pat}`,
    "User-Agent": this.userAgent,
    "X-GitHub-Api-Version": "2022-11-28",
  })

  private _rawHeaders = (): Record<string, string> => ({
    "Authorization": `Bearer ${this.pat}`,
    "User-Agent": this.userAgent,
  })

  private _getCommitSha = async (
    owner: string,
    repo: string,
    branch: string
  ): Promise<string> => {
    const url = `${API_BASE}/repos/${owner}/${repo}/git/refs/heads/${branch}`
    const res = await this._fetch(url, this._apiHeaders())
    const json = (await res.json()) as { object: { sha: string } }
    return json.object.sha
  }

  private _defaultPushedAfter = (): string => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 2)
    return d.toISOString().slice(0, 10)
  }

  private _toSearchItem = (raw: unknown): GithubSearchItem => {
    const r = raw as {
      default_branch: string
      full_name: string
      id: number
      license: { spdx_id: string | null } | null
      name: string
      owner: { login: string }
      pushed_at: string
      stargazers_count: number
    }
    return {
      id: r.id,
      defaultBranch: r.default_branch,
      fullName: r.full_name,
      /** license が null や spdx_id 不明な場合は空文字（呼び出し側で弾く） */
      license: r.license?.spdx_id ?? "",
      name: r.name,
      owner: r.owner.login,
      pushedAt: r.pushed_at,
      stars: r.stargazers_count,
    }
  }

  private _toTreeEntry = (raw: unknown): GithubTreeEntry | null => {
    if (typeof raw !== "object" || raw === null) return null
    const r = raw as { path?: unknown; size?: unknown; type?: unknown }
    if (typeof r.path !== "string") return null
    if (r.type !== "blob" && r.type !== "tree") return null
    return {
      path: r.path,
      size: typeof r.size === "number" ? r.size : null,
      type: r.type,
    }
  }
}
