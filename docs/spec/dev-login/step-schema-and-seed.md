# step: schema 追加と dev ユーザー seed

`packages/schema` に dev-login の API 契約を追加し、`packages/db/prisma/seed.ts` で dev ユーザー（alice / bob）を upsert する。

## 対応内容

### `packages/schema/src/api-schema/auth.ts`

`POST /api/auth/dev-login` セクションを追加する。

```typescript
// ========================================================
// POST /api/auth/dev-login - 開発環境専用ログイン
// ========================================================

export const authDevLoginRequestSchema = z.object({
  email: z.string().email(),
})
export type AuthDevLoginRequest = z.infer<typeof authDevLoginRequestSchema>

export const authDevLoginResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  user: authUserSchema,
})
export type AuthDevLoginResponse = z.infer<typeof authDevLoginResponseSchema>
```

`user` は `authGithubResponseSchema` と共有している `authUserSchema` を再利用する。フィールドは `{ avatar_url, can_public_ranking, created_at, email, github_username, id }` の 6 項目で、User モデルから廃止された `name` は持たない（表示名は `github_username` を使う）。

### `packages/db/prisma/seed.ts`

`NODE_ENV === "production"` ではスキップ。`User` と `AuthAccount(provider: "dev")` を upsert する。

```typescript
const devUsers = [
  { email: "alice@dev.local", githubUsername: "alice" },
  { email: "bob@dev.local",   githubUsername: "bob" },
]

if (process.env.NODE_ENV === "production") return
for (const { email, githubUsername } of devUsers) {
  const user = await prisma.user.upsert({
    create: { email, githubUsername },
    update: { githubUsername },
    where: { email },
  })
  await prisma.authAccount.upsert({
    create: { provider: "dev", providerAccountId: email, userId: user.id },
    update: {},
    where: { provider_providerAccountId: { provider: "dev", providerAccountId: email } },
  })
}
```

## 動作確認

```bash
# スキーマビルド
cd packages/schema && pnpm build

# seed 実行
cd apps/api && pnpm db:seed

# DB の中身確認
pnpm db:studio
# → users に alice@dev.local / bob@dev.local
# → auth_accounts に provider="dev" の 2 行
```
