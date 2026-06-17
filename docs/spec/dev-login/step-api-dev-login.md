# step: API に dev-login を追加

`apps/api` に dev-login のレイヤード実装（Service → Controller → Router → DI）と本番ガードを追加する。

## 対応内容

### `apps/api/src/service/auth-service.ts`

`loginAsDevUser` を追加。GitHub 認証と同じ Token 生成ロジック / Redis 保存ロジックを使う。

```typescript
export const loginAsDevUser = async (
  input: { email: string },
  repo: {
    refreshTokenRepository: RefreshTokenRepository
    userRepository: UserRepository
  },
  tokenGenerators: TokenGenerators
): Promise<Result<{ accessToken: string; refreshToken: string; user: User }>> => {
  const user = await repo.userRepository.findByEmail(input.email)
  if (!user) return err(notFoundError("Dev user not found"))

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repo.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  return ok({ accessToken, refreshToken, user })
}
```

### `apps/api/src/controller/auth/dev-login.ts`

`AuthDevLoginController` を新規作成。`NODE_ENV === "production"` で 404 を返すガードを入れる。

```typescript
export class AuthDevLoginController {
  constructor(
    private userRepository: UserRepository,
    private refreshTokenRepository: RefreshTokenRepository,
  ) {}

  async execute(req: Request, res: Response) {
    if (process.env.NODE_ENV === "production") {
      return res.status(404).json({ error: "Not Found", status_code: 404 })
    }
    const { email } = parseRequest(authDevLoginRequestSchema, req.body)
    const result = await service.auth.loginAsDevUser(
      { email },
      { refreshTokenRepository: this.refreshTokenRepository, userRepository: this.userRepository },
      { generateAccessToken, generateRefreshToken },
    )
    if (!result.ok) {
      return sendError(req, res, result.error)
    }
    const { accessToken, refreshToken, user } = result.value
    const response = parseResponse(authDevLoginResponseSchema, {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        can_public_ranking: user.canPublicRanking,
        created_at: user.createdAt.toISOString(),
        email: user.email,
        github_username: user.githubUsername,
        id: user.id,
      },
    })
    return res.status(200).json(response)
  }
}
```

返却 user は `authUserSchema`（`authGithubResponseSchema` と共有）を再利用しており、フィールドは `{ avatar_url, can_public_ranking, created_at, email, github_username, id }` の 6 項目。User モデルから廃止された `name` は持たない（表示名は `github_username` を使う）。

### `apps/api/src/const/index.ts`

`PUBLIC_PATHS` に dev-login を追加（production 以外のみ）。

```typescript
const DEV_ONLY_PUBLIC_PATHS = process.env.NODE_ENV !== "production"
  ? ["/api/auth/dev-login"]
  : []

export const PUBLIC_PATHS: readonly string[] = [
  "/api/auth/github",
  "/api/auth/refresh",
  "/api/health",
  "/api/memo",
  ...DEV_ONLY_PUBLIC_PATHS,
]
```

### `apps/api/src/routes/auth-router.ts`

`devLogin?: AuthDevLoginController` を controllers に追加し、与えられた場合のみ `/dev-login` を登録する。

### `apps/api/src/index.ts`

production 以外でだけ controller をインスタンス化して router に渡す。

```typescript
const authDevLoginController = process.env.NODE_ENV !== "production"
  ? new AuthDevLoginController(userRepository, refreshTokenRepository)
  : undefined

app.use("/api/auth", authRouter({
  devLogin: authDevLoginController,
  github: authGithubController,
  ...
}))
```

## 動作確認

```bash
cd apps/api
pnpm db:seed
pnpm dev
```

```bash
# dev ユーザーで token 発行
curl -X POST http://localhost:8080/api/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@dev.local"}' | jq

# 期待: 200 で { access_token, refresh_token, user: {...} }
```

```bash
# 存在しない email
curl -X POST http://localhost:8080/api/auth/dev-login \
  -H "Content-Type: application/json" \
  -d '{"email":"nope@dev.local"}'

# 期待: 404 { error: "Dev user not found", status_code: 404 }
```

production 起動を模擬 (`NODE_ENV=production`) してリクエストすると、ルート未登録のため Express デフォルトの 404 が返ることを確認する。
