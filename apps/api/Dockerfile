# ==============================================================================
# Stage 1: base - pnpm をインストールしたベースイメージ
# ==============================================================================
FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ==============================================================================
# Stage 2: builder - 依存インストール & ビルド
# ==============================================================================
FROM base AS builder

WORKDIR /app

# モノレポ設定ファイルをコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# 各パッケージの package.json をコピー
COPY apps/api/package.json ./apps/api/
COPY packages/schema/package.json ./packages/schema/

# 依存インストール
RUN pnpm install --frozen-lockfile

# 各パッケージのtsconfig.jsonをコピー
COPY packages/schema/tsconfig.json ./packages/schema/
COPY apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/

# ソースコードをコピー
COPY packages/schema/src/ ./packages/schema/src/
COPY apps/api/src/ ./apps/api/src/

# 共有スキーマパッケージをビルド → API をビルド
RUN pnpm --filter @repo/api-schema build

# Prisma Client を生成
RUN cd apps/api && pnpm exec prisma generate --schema=src/prisma/schema.prisma

# API をビルド
RUN pnpm --filter api build

# 本番用依存のみを抽出
RUN pnpm deploy --filter api --prod /app/deploy

# ==============================================================================
# Stage 3: runner - 本番実行用の軽量イメージ
# ==============================================================================
FROM node:20-slim AS runner

# tini: Node.js を PID 1 で直接実行すると SIGTERM 等のシグナルを正しく処理できず、SIGKILLによる強制削除が起きてしまうため
# 軽量 init プロセスとして tini を使用。ECS Fargate では docker --init が使えないため必須。
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# deploy ステージから本番依存をコピー
COPY --chown=node:node --from=builder /app/deploy/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/deploy/package.json ./package.json

# ビルド済みコードをコピー
COPY --chown=node:node --from=builder /app/apps/api/dist ./dist

EXPOSE 8080

# ENTRYPOINT: コンテナ起動時に必ず実行されるコマンド。CMD の内容が引数として渡される。
# 実行されるコマンド: /usr/bin/tini -- node dist/index.js
ENTRYPOINT ["/usr/bin/tini", "--"]

# root で実行すると脆弱性を突かれた際にホストへの影響が大きいため、非特権ユーザーで実行
USER node

CMD ["node", "dist/index.js"]
