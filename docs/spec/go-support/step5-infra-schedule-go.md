# step5: Go クローラの EventBridge スケジュール（別 PR）

Go 用クローラを本番で定期起動するための EventBridge Scheduler → ECS Scheduled Task を追加する。

> **この step はアプリ実装（step1〜4）とは別 PR に分離する**。「terraform とアプリを 1 PR にしない」方針に従う。app PR がマージされ、`dist/task/crawler-run-go.js` と `tree-sitter-go.wasm` がイメージに含まれてから infra PR を当てる。

## 対応内容

### `infra/terraform/aws/env/prd/main.tf`（モジュール 1 つ追加）

既存 `schedule_crawler_typescript` を雛形に、Go 用スケジュールを追加する。TypeScript（月曜 03:00）/ JavaScript（月曜 04:30）と **時間をずらす**（例：月曜 06:00 JST）。

```hcl
module "schedule_crawler_go" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-crawler-go"
  schedule_expression = "cron(0 6 ? * MON *)" # 毎週月曜 06:00 JST（TS/JS とずらす）

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-run-go.js"]

  tags = local.common_tags
}
```

`task_definition_family` は cron 共通（`module.ecs_cron`）を流用。`command` のみ `crawler-run-go.js` に差し替える。L707-712 の稼働タスク一覧コメントに Go 行を追記する。

> **前提**：cron イメージのビルドで `tree-sitter-go.wasm` が `dist/` に同梱されていること（go-support step2 / step3）。wasm が無いと task 起動時に parser ロードで落ちる。

## 動作確認

- `terraform fmt -check -recursive` / `terraform validate` / `tflint` / `trivy` が緑。
- `terraform plan` で `module.schedule_crawler_go` の **新規 1 リソース追加のみ**であること。
- apply 後、EventBridge Scheduler で `*-crawler-go` が有効・次回実行時刻が想定どおりであること。
- 初回手動実行で `crawler_runs` に `crawler_go` の run が記録され、Go の `problems` が増えることを確認。

> AWS OIDC provider 未整備の環境では TFLint/Plan ジョブが赤くなることがある（既知）。Format/Validate/Trivy が緑なら PR 起因ではない。
</content>
