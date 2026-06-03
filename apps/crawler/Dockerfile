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

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

COPY apps/crawler/package.json ./apps/crawler/
COPY packages/schema/package.json ./packages/schema/

RUN pnpm install --frozen-lockfile

COPY packages/schema/tsconfig.json ./packages/schema/
COPY apps/crawler/tsconfig.json apps/crawler/tsconfig.build.json ./apps/crawler/

COPY packages/schema/src/ ./packages/schema/src/
COPY apps/crawler/src/ ./apps/crawler/src/

RUN pnpm --filter @repo/api-schema build
RUN pnpm --filter crawler build

# 本番用依存のみを抽出
RUN pnpm deploy --filter crawler --prod /app/deploy

# ==============================================================================
# Stage 3: runner - 本番実行用の軽量イメージ
# ==============================================================================
FROM node:20-slim AS runner

# tini: ECS Fargate では docker --init が使えないため軽量 init として必須
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --chown=node:node --from=builder /app/deploy/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/deploy/package.json ./package.json
COPY --chown=node:node --from=builder /app/apps/crawler/dist ./dist

ENTRYPOINT ["/usr/bin/tini", "--"]

USER node

# デフォルトは crawler:run。ECS Task Definition の command で
# license-recheck / ranking-batch などに差し替える想定。
CMD ["node", "dist/cli/run.js"]
