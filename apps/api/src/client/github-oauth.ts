/**
 * GitHub から取得するユーザー基本情報
 *
 * email は `user:email` スコープを要求した場合のみ取得できる（MVP では未取得）。
 * GitHub では数値の `id` を不変識別子として用いるため string 化して保持する。
 */
export type GithubUserInfo = {
    avatarUrl: string | null
    id: string
    login: string
    name: string | null
}

/**
 * GitHub OAuth クライアントのインターフェース
 *
 * code → access_token の交換 → /user の取得 までを 1 関数にまとめている。
 * 本アプリでは access_token を保持しない方針のため、access_token を外に返さない。
 */
export interface IGithubOAuthClient {
    getUserInfo(code: string, redirectUri: string): Promise<GithubUserInfo>
}

type GithubAccessTokenResponse = {
    access_token?: string
    error?: string
    error_description?: string
    scope?: string
    token_type?: string
}

type GithubUserResponse = {
    avatar_url?: string | null
    id: number
    login: string
    name?: string | null
}

/**
 * 実 GitHub API を叩く OAuth クライアント
 *
 * fetch でシンプルに HTTP を叩く（外部 SDK は使わない）。
 * Accept: application/json を指定して access_token 応答を JSON で受ける。
 */
export class GithubOAuthClient implements IGithubOAuthClient {
  private clientId: string
  private clientSecret: string

  constructor(clientId: string, clientSecret: string) {
    this.clientId = clientId
    this.clientSecret = clientSecret
  }

  public async getUserInfo(code: string, redirectUri: string): Promise<GithubUserInfo> {
    /**
     * code → access_token
     *
     * GitHub の access_token エンドポイントは redirect_uri を要求する（OAuth Apps の場合は省略可能だが、
     * 一貫性のため Google と同様にリクエスト時の URL をそのまま渡す）。
     */
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
    })

    if (!tokenResponse.ok) {
      throw new Error(`GitHub token exchange failed: HTTP ${tokenResponse.status}`)
    }

    const tokenData = await tokenResponse.json() as GithubAccessTokenResponse

    if (tokenData.error || !tokenData.access_token) {
      /**
       * GitHub は OAuth エラーでも HTTP 200 を返すため、ボディの error を見て判定する。
       * 詳細メッセージはログにのみ残し、外部に晒さない。
       */
      throw new Error(`GitHub token exchange failed: ${tokenData.error ?? "no access_token"}`)
    }

    /**
     * access_token → /user
     */
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${tokenData.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    })

    if (!userResponse.ok) {
      throw new Error(`GitHub /user fetch failed: HTTP ${userResponse.status}`)
    }

    const userData = await userResponse.json() as GithubUserResponse

    return {
      avatarUrl: userData.avatar_url ?? null,
      id: String(userData.id),
      login: userData.login,
      name: userData.name ?? null,
    }
  }
}
