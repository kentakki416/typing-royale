# タイピングロワイヤル（TypingRoyale）

エンジニア向けのコードタイピングゲーム。GitHub から自動収集した **OSS の実コード** を 120 秒で打鍵し、エンジニアグレード（Intern → Fellow）の昇格と「神々に挑戦」モードによる競技性を楽しめる Web プロダクト。

詳細はドキュメントを参照：

- [`docs/README.md`](docs/README.md) — プロダクト全体像
- [`docs/spec/README.md`](docs/spec/README.md) — 各機能の設計書
- [`docs/infra.md`](docs/infra.md) — インフラ設計
- [`TODO.md`](TODO.md) — 実装 TODO

Turborepo + pnpm monorepo を使用したフルスタック構成。

## 目次

- [プロジェクト構成](#プロジェクト構成)
  - [ディレクトリ構造](#ディレクトリ構造)
  - [モノレポ依存関係](#モノレポ依存関係)
  - [デプロイ・アーキテクチャ](#デプロイアーキテクチャ)
- [主要機能](#主要機能)
- [技術スタック](#技術スタック)
- [クイックリファレンス](#クイックリファレンス)
- [テンプレートの使い方](#テンプレートの使い方)
  - [1. プロジェクトのコピー](#1-プロジェクトのコピー)
  - [2. 環境変数の設定](#2-環境変数の設定)
- [セットアップガイド](#セットアップガイド)
- [Claude Code（MCP設定）](#claude-codemcp設定)
- [開発ルール](#開発ルール)
  - [1. 命名規則](#1-命名規則)
  - [2. 基本コマンド](#2-基本コマンド)
  - [3. pnpm ワークスペースコマンド](#3-pnpm-ワークスペースコマンド)
  - [4. 環境変数の管理コマンド](#4-環境変数の管理コマンド)
  - [5. Docker環境の起動コマンド](#5-docker環境の起動コマンド)

## プロジェクト構成

### ディレクトリ構造

```
typing-royale/
├── apps/
│   ├── web/                 # Next.js 16 — ユーザー向け Web（Vercel デプロイ、port 3000）
│   ├── admin/               # Next.js 16 — 運営管理ダッシュボード（port 3030）
│   ├── mobile/              # Expo / React Native — モバイルアプリ（将来拡張用）
│   ├── api/                 # Express 5 — REST API（ECS Fargate Service、port 8080）
│   └── cron/                # GitHub 週次クローラ + 月次ライセンス再検証 + 毎時ランキング集計（ECS Scheduled Task）
├── packages/
│   ├── schema/              # @repo/api-schema — Zod スキーマ・型定義（全アプリ共有）
│   └── db/                  # @repo/db — Prisma スキーマ / Client / Repository（api・cron で共有）
├── infra/
│   └── terraform/           # AWS Infrastructure as Code（RDS / ElastiCache / ECS / ALB / EventBridge / S3）
├── docs/
│   ├── README.md            # プロダクト全体像（ペルソナ・MVP スコープ・体験フロー）
│   ├── infra.md             # インフラ設計（サービス選定・コスト試算）
│   ├── auth.md              # 認証設計
│   ├── mcp.md               # MCP サーバー一覧
│   └── spec/                # 機能別設計書（typing-engine / problem-pool / ghost-battle …）
├── scripts/                 # テンプレートコピー・シークレット投入スクリプト
├── docker-compose.yaml      # ローカル開発用 Postgres 16 + Redis 7
└── turbo.json               # Turborepo パイプライン定義
```

> **api / cron を分離する理由**：両者は責務（HTTP 処理 / 定期実行）も実行モデル（常駐サービス / Scheduled Task）も異なる。Docker image と ECR リポジトリを分けることで、cron が必要とする AST パーサ等の重い依存を api バンドルに混ぜずに済み、CI とデプロイも独立化できる。cron はクローラ・ライセンス再検証・ランキング集計をまとめた 1 つの Image で、ECS Task Definition の `command` で実行する CLI を切り替える。Prisma スキーマと Repository 層は `packages/db` で共有して DRY を保つ。

### モノレポ依存関係

`packages/schema`（Zod）と `packages/db`（Prisma + Repository）を共有し、api と cron が同じデータモデルで動作する。

```mermaid
graph LR
    Schema["packages/schema<br/>@repo/api-schema"]
    DB["packages/db<br/>@repo/db<br/>Prisma + Repository"]

    Schema --> Web["apps/web"]
    Schema --> Admin["apps/admin"]
    Schema --> Mobile["apps/mobile"]
    Schema --> API["apps/api"]
    Schema --> Cron["apps/cron"]

    DB --> API
    DB --> Cron

    Web -->|REST| API
    Admin -->|REST /api/admin| API
    Mobile -->|REST| API
```

### デプロイ・アーキテクチャ

web のみ **Vercel**、それ以外（API・cron・DB・Redis・S3）は **AWS 単一 VPC** に集約。cron は EventBridge から呼び出される ECS Scheduled Task で、週次クローラ / 月次ライセンス再検証 / 毎時ランキング集計を `command` で切り替える。詳細は [`docs/infra.md`](docs/infra.md) を参照。

```mermaid
flowchart TB
    User["👤 ユーザー<br/>Browser / Mobile"]

    subgraph Vercel["☁️ Vercel"]
        WebHost["apps/web<br/>Next.js 16 (SSR + Route Handler)"]
    end

    subgraph AWS["☁️ AWS（infra/terraform）"]
        Route53["Route 53<br/>DNS"]
        ALB["Application Load Balancer"]
        ECSApi["ECS Fargate Service<br/>apps/api (Express)"]
        ECSCron["ECS Scheduled Task<br/>apps/cron<br/>週次クローラ・月次ライセンス再検証・毎時ランキング集計"]
        EventBridge["EventBridge<br/>cron スケジューラ"]
        RDS[("RDS PostgreSQL<br/>db.t4g.micro")]
        Redis[("ElastiCache Redis<br/>cache.t4g.micro")]
        S3[("S3<br/>達成カード PNG / アバター")]
        CloudFront["CloudFront<br/>S3 配信 + 動的 SVG バッジ"]
        Secrets["Secrets Manager"]
    end

    subgraph External["🌐 外部サービス"]
        GitHub["GitHub<br/>OAuth + Search/Tree API"]
        AdSense["Google AdSense"]
    end

    User --> Route53
    Route53 -->|app.example.com| WebHost
    Route53 -->|api.example.com| ALB
    Route53 -->|cdn.example.com| CloudFront

    WebHost -->|REST| ALB
    ALB --> ECSApi
    CloudFront --> S3

    ECSApi --> RDS
    ECSApi --> Redis
    ECSApi --> S3
    ECSApi --> Secrets
    ECSApi -->|OAuth| GitHub

    EventBridge --> ECSCron
    ECSCron -->|Search / Tree API| GitHub
    ECSCron --> RDS
    ECSCron --> Redis
    ECSCron --> Secrets

    WebHost -.広告.-> AdSense
```

## 主要機能

ユーザージャーニーは [`docs/README.md`](docs/README.md)、各機能の詳細仕様は [`docs/spec/`](docs/spec/README.md) を参照。

| 機能 | 概要 | 詳細 |
|---|---|---|
| typing-engine | 120 秒制限・関数の連続出題・入力判定・スコア計算 | [docs/spec/typing-engine](docs/spec/typing-engine/README.md) |
| problem-pool | 週次 cron で GitHub Star 上位の寛容ライセンス OSS をクロールし AST で関数本体を抽出 | [docs/spec/problem-pool](docs/spec/problem-pool/README.md) |
| github-auth | GitHub OAuth 読み取り最小スコープでのログイン | [docs/spec/github-auth](docs/spec/github-auth/README.md) |
| score-ranking | 言語別全期間トップ 1000・**エンジニアグレード**（Intern → Fellow の 8 段階） | [docs/spec/score-ranking](docs/spec/score-ranking/README.md) |
| ghost-battle | 「神々に挑戦」モード — トップ 10 ランダム選定で同じ問題シーケンスを併走 | [docs/spec/ghost-battle](docs/spec/ghost-battle/README.md) |
| replay-viewer | トップ 10 入賞プレイのキーストローク再描画（動画ファイル不要） | [docs/spec/replay-viewer](docs/spec/replay-viewer/README.md) |
| rewards | 動的 SVG バッジ / 達成カード PNG / 3D アイコン / Hall of Fame | [docs/spec/rewards](docs/spec/rewards/README.md) |
| adsense | プレイ中非表示の Google AdSense ディスプレイ広告 | [docs/spec/adsense](docs/spec/adsense/README.md) |

## 技術スタック

#### モノレポ・ビルド
![Turborepo](https://img.shields.io/badge/Turborepo-EF4444?style=for-the-badge&logo=turborepo&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-F69220?style=for-the-badge&logo=pnpm&logoColor=white)

#### バックエンド
![Express](https://img.shields.io/badge/Express%205-000000?style=for-the-badge&logo=express&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma%207-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![Zod](https://img.shields.io/badge/Zod-3E67B1?style=for-the-badge&logo=zod&logoColor=white)

#### フロントエンド
![Next.js](https://img.shields.io/badge/Next.js%2016-000000?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React%2019-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)

#### モバイル
![Expo](https://img.shields.io/badge/Expo%2054-000020?style=for-the-badge&logo=expo&logoColor=white)
![React Native](https://img.shields.io/badge/React%20Native%200.81-61DAFB?style=for-the-badge&logo=react&logoColor=black)

#### 認証
![JWT](https://img.shields.io/badge/JWT-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white)
![Google OAuth](https://img.shields.io/badge/Google%20OAuth-4285F4?style=for-the-badge&logo=google&logoColor=white)

#### データベース・キャッシュ
![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis%207-DC382D?style=for-the-badge&logo=redis&logoColor=white)

#### テスト
![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)

#### ロギング・環境変数
![Pino](https://img.shields.io/badge/Pino-687634?style=for-the-badge&logo=pino&logoColor=white)
![dotenvx](https://img.shields.io/badge/dotenvx-000000?style=for-the-badge&logo=dotenv&logoColor=white)

#### インフラ・CI/CD
![AWS](https://img.shields.io/badge/AWS-232F3E?style=for-the-badge&logo=amazonwebservices&logoColor=white)
![ECS Fargate](https://img.shields.io/badge/ECS%20Fargate-FF9900?style=for-the-badge&logo=amazonecs&logoColor=white)
![Terraform](https://img.shields.io/badge/Terraform-7B42BC?style=for-the-badge&logo=terraform&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)

## クイックリファレンス

| ドキュメント | 内容 |
|---|---|
| [docs/mcp.md](docs/mcp.md) | MCP サーバーの一覧・使い方・追加方法 |
| [.claude/README.md](.claude/README.md) | Claude Code の設定（Agents・Commands・Skills） |

---

## テンプレートの使い方

### 1. プロジェクトのコピー

`scripts/copy-template.sh` を実行して、テンプレートを新しいプロジェクトとしてコピーします。

```bash
# 例: プロジェクト名を明示的に指定
./scripts/copy-template.sh ../my-new-app my-new-app

# 例: 絶対パスで指定 ⚠️ プロジェクト名を省略した場合、コピー先ディレクトリ名が使用される
./scripts/copy-template.sh ~/workspace/my-new-app
```

### 2. 環境変数の設定

各アプリの `.env.local` は [dotenvx](https://dotenvx.com/) で暗号化されています。復号に必要な `.env.keys` を管理者から受け取り、プロジェクトルートに配置してください。

各アプリ (`apps/api`, `apps/web`, `apps/mobile`) にはルートへのシンボリックリンクが git に含まれているため、ルートに置くだけで全アプリから参照されます。

```
<project-root>/
├── .env.keys                        ← ここに配置
├── apps/
│   ├── api/.env.keys → ../../.env.keys   (シンボリックリンク)
│   ├── web/.env.keys → ../../.env.keys   (シンボリックリンク)
│   └── mobile/.env.keys → ../../.env.keys (シンボリックリンク)
```

<details>
<summary>（管理者向け）.env.keys の作成方法とシンボリックリンクの貼り方</summary>

ゼロからプロジェクトをセットアップする管理者向けの手順です。既に `.env.keys` を受け取っている開発者は実施不要です。

```bash
# 1. ルートで .env.keys を生成（初回 set でついでに鍵が作られる）
npx dotenvx set _BOOTSTRAP "x" -f .env.local
rm .env.local                          # ← ルートに .env.local は要らないので削除

# 2. 各アプリにルートを指すシンボリックリンクを張る
ln -s ../../.env.keys apps/api/.env.keys
ln -s ../../.env.keys apps/web/.env.keys
ln -s ../../.env.keys apps/mobile/.env.keys
```

以降は **必ずプロジェクトルートから** `npx dotenvx set KEY "value" -f apps/<app>/.env.local` を実行すること（各アプリで `cd` して直接叩くと、シンボリックリンクが実体ファイルで上書きされ、アプリごとに別の鍵ペアが生成されてしまう）。

</details>

## セットアップガイド

用途別のセットアップ手順は対応するディレクトリの README にまとまっている:

| 対象 | 手順 | 主な内容 |
|---|---|---|
| API (apps/api) | [apps/api/README.md#セットアップ](apps/api/README.md#セットアップ) | dotenvx 鍵配置 / Docker Compose / Prisma generate・migrate・seed / dev サーバー起動 / ECS migration / トラブルシューティング |
| AWS インフラ (infra/terraform) | [infra/README.md#aws-インフラのセットアップ](infra/README.md#aws-インフラのセットアップ) | プロジェクト名リネーム / Bootstrap / Account / GitHub Environments / env/dev / env/prd / トラブルシューティング |
| Secrets Manager 投入スクリプト | [scripts/README.md](scripts/README.md) | seed-secrets.sh の使い方と前提条件 |

## Claude Code（MCP設定）

このプロジェクトでは MCP サーバーの設定ファイル（`.mcp.json`）をリポジトリルートに配置しています。Claude Code 起動時に MCP サーバーを認識させるには、以下のコマンドを使用してください:

```bash
claude --mcp-config=./.mcp.json
```

MCP サーバーの詳細は [docs/mcp.md](docs/mcp.md) を参照してください。

## 開発ルール

### 1. 命名規則

| 対象 | 規則 | 例 |
|---|---|---|
| ディレクトリ | kebab-case | `user-profile/`, `api-schema/` |
| 一般ファイル（hooks, utils, lib等） | kebab-case | `use-auth.ts`, `api-client.ts`, `format-date.ts` |
| Componentをexportするファイル | PascalCase | `UserProfile.tsx`, `LoginForm.tsx`, `Button.tsx` |
| テストファイル | テスト対象の関数名 + `.test.ts` | `getUserById.test.ts`, `authenticateWithGoogle.test.ts` |

### 2. 基本コマンド

```bash
pnpm dev          # 全アプリを開発モードで起動
pnpm build        # 全アプリをビルド
pnpm lint         # ESLint 実行
pnpm lint:fix     # ESLint 自動修正
pnpm test         # テスト実行
```

### 3. pnpm ワークスペースコマンド

```bash
# 特定のワークスペースでコマンドを実行
pnpm --filter <workspace-name> <command>

# 例: webアプリのみ起動
pnpm --filter web dev

# すべてのワークスペースに依存関係を追加
pnpm add -w <package-name>

# 特定のワークスペースに依存関係を追加
pnpm --filter <workspace-name> add <package-name>

# 特定のワークスペースのdevDependenciesに依存関係を追加
pnpm --filter web add -D @types/node

# 依存関係を削除
pnpm --filter <workspace-name> remove <package-name>

# すべての node_modules を削除して再インストール
pnpm clean && pnpm install
```

### 4. 環境変数の管理コマンド

```bash
# .env.local の暗号化
cd apps/api && pnpm exec dotenvx encrypt -f .env.local

# .env.local の復号化
cd apps/api && pnpm exec dotenvx decrypt -f .env.local
```

### 5. Docker環境の起動コマンド

```bash
# Dockerコンテナを起動
docker compose up -d

# コンテナの状態を確認
docker compose ps

# ログを確認
docker compose logs -f

# コンテナを停止
docker compose down

# データを含めて完全に削除
docker compose down -v
```
