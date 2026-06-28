# step3: JavaScript クローラの EventBridge スケジュール（別 PR）

JavaScript 用クローラを本番で定期起動するための EventBridge Scheduler → ECS Scheduled Task を追加する。

> **この step はアプリ実装（step1 / step2）とは別 PR に分離する**。「terraform とアプリを 1 PR にしない」方針に従う。app PR がマージされ、`dist/task/crawler-run-javascript.js` がイメージに含まれてから infra PR を当てる。

## 対応内容

### `infra/terraform/aws/env/prd/main.tf`（モジュール 1 つ追加）

既存 `schedule_crawler_typescript` を雛形に、JavaScript 用スケジュールを追加する。**TypeScript（月曜 03:00）とは時間をずらして** GitHub API 負荷と ECS の同時起動を避ける（例：月曜 04:30 JST）。

```hcl
module "schedule_crawler_javascript" {
  source = "../../modules/ecs-scheduled-task"

  name                = "${local.name_prefix}-crawler-javascript"
  schedule_expression = "cron(30 4 ? * MON *)" # 毎週月曜 04:30 JST（TS とずらす）

  cluster_arn            = module.ecs_cluster.cluster_arn
  task_definition_family = module.ecs_cron.task_definition_family
  execution_role_arn     = module.ecs_cluster.task_execution_role_arn

  subnets         = local.ecs_common.subnets
  security_groups = local.ecs_common.security_groups

  container_name = "${local.name_prefix}-cron"
  command        = ["node", "dist/task/crawler-run-javascript.js"]

  tags = local.common_tags
}
```

`task_definition_family` は cron 共通（`module.ecs_cron`）を使い回す。`command` だけを `crawler-run-javascript.js` に差し替える点が肝。新しい task definition やイメージは不要（同一 cron イメージ内の別エントリを叩くだけ）。

L707-712 のコメント（稼働中タスク一覧）に JavaScript 行を追記する。

## 動作確認

- `terraform fmt -check -recursive` / `terraform validate` / `tflint` / `trivy` が緑。
- `terraform plan` で `module.schedule_crawler_javascript` の **新規 1 リソース追加のみ**（既存リソースに変更なし）であること。
- apply 後、AWS コンソール（EventBridge Scheduler）で `*-crawler-javascript` が有効・次回実行時刻が想定どおりであること。
- 初回手動実行（`aws scheduler` or 手動 RunTask）で `crawler_runs` に `crawler_javascript` の run が記録されることを確認。

> **注意**：`docs/spec/.../project_terraform_ci_oidc_not_provisioned` の前提どおり、AWS OIDC provider 未整備の環境では TFLint/Plan ジョブが赤くなることがある。Format/Validate/Trivy が緑なら PR 起因の失敗ではない。
</content>
