# 特典（リワード）

エンジニアが「自慢したくなる」要素を提供する。MVP は **運用負荷の低い 3 種類** に絞る：動的 SVG バッジ・達成カード PNG・Hall of Fame 掲載。3D アイコン・Lottie・トレーディングカード等の運用負荷高めの特典は **Coming Soon** として将来対応する。

このドキュメントは **仕様（What）** と **設計（How）** を分けて記述する：

- **仕様**：MVP の特典内容、獲得条件、Coming Soon の予告
- **設計**：SVG バッジの配信戦略、画像生成方式、拡散効果計測、将来検討の切り出し

## 関連 spec

- [`../score-ranking/README.md`](../score-ranking/README.md) — 特典獲得トリガーの源泉（`user_lifetime_stats`、ランキングバッチ、グレード判定）
- [`../github-auth/README.md`](../github-auth/README.md) — `publicRanking` 設定・アカウント削除との連動
- [`./deferred-rich-rewards.md`](./deferred-rich-rewards.md) — 3D アイコン・Lottie・トレーディングカード等の将来特典の設計案

## 目次

- [仕様](#仕様)
  - [MVP の特典 3 種](#mvp-の特典-3-種)
  - [獲得条件（暫定）](#獲得条件暫定)
  - [Coming Soon（運用負荷が高いので Phase 2 以降）](#coming-soon運用負荷が高いので-phase-2-以降)
  - [GitHub への書き込みは行わない](#github-への書き込みは行わない)
  - [削除対応](#削除対応)
- [設計](#設計)
  - [動的 SVG バッジの配信戦略](#動的-svg-バッジの配信戦略)
  - [達成カード PNG の生成](#達成カード-png-の生成)
  - [Hall of Fame コメントの入力タイミング](#hall-of-fame-コメントの入力タイミング)
  - [Hall of Fame コメントの保護](#hall-of-fame-コメントの保護)
  - [拡散ループの計測](#拡散ループの計測)
  - [MVP 対象外（将来検討）](#mvp-対象外将来検討)
- [必要な画面](#必要な画面)
- [必要な API](#必要な-api)
- [必要な DB 設計](#必要な-db-設計)
- [フロー図](#フロー図)

---

## 仕様

### MVP の特典 3 種

| 特典 | 形式 | 提供方法 | 運用負荷 |
| --- | --- | --- | --- |
| **動的 SVG バッジ** | SVG（API がリアルタイム生成） | README に `<img src="https://.../badge/USERNAME.svg">` を貼る | 低（コード生成のみ） |
| **達成証明カード** | PNG 画像（OG カード風） | 達成時に自動生成、ダウンロード／SNS シェアボタン | 低（`satori` で自動生成） |
| **Hall of Fame 掲載** | サイト内ページ | 自動掲載＋本人コメント欄 | 低（DB から表示） |

3 種いずれも **コードだけで完結** し、デザイナーや 3D アーティストの継続的なコミットを必要としない。

### 獲得条件（暫定）

| 特典 | 条件例 |
| --- | --- |
| 動的 SVG バッジ | ログイン直後から利用可。**現在のグレード**・ベストスコア・全期間ランク・連続日数を自動反映 |
| 達成カード PNG | **グレードアップ時**（Junior → Mid 等で各 1 枚自動生成）/「累計 10,000 文字」「累計 100,000 文字」「初トップ 10」「7 日連続プレイ」など節目 |
| Hall of Fame 掲載 | 各言語のオールタイムトップ 10 |

正式な閾値は MVP 直前にデータを見て調整する。

エンジニアグレードの仕様（評価軸・閾値・降格なし）は[`../score-ranking/README.md` 「エンジニアグレード」](../score-ranking/README.md#エンジニアグレード) を参照。

### Coming Soon（運用負荷が高いので Phase 2 以降）

UI 上に **「Coming Soon」** として 5 種を予告する。プレースホルダ枠だけ用意し、未獲得状態で表示。ユーザーには「これから増える」期待感を持たせる。

| 特典 / 機能 | 予告 |
| --- | --- |
| **3D オリジナルキャラ** | グレード連動の 3D アバター（8 体）。SNS アイコン・Discord・VRChat 用 |
| **Lottie アニメーションアバター** | 動くプロフィール画像。Web / Twitter / Discord 対応 |
| **AI トレーディングカード** | DALL-E 等で背景生成、ステータス重ね合わせの限定カード |
| **プロシージャル アート** | userId をシードに決定論的に生成するハッカー的識別子 |
| **公式 X による上位者紹介投稿** | トップ 10 入り・グレード昇格・累計達成で公式アカウントが自動紹介（オプトイン） |

設計詳細とトリガー条件は [`./deferred-rich-rewards.md`](./deferred-rich-rewards.md) を参照。

### GitHub への書き込みは行わない

- バッジ URL は **ユーザーが手動で README に貼る** スタイルで提供（OAuth の `repo` スコープは要求しない）。
- 「ワンクリックで README に追記」のような機能は MVP では非対応。

### 削除対応

- アカウント削除（[`../github-auth/README.md` 「アカウント削除」](../github-auth/README.md#アカウント削除)）時、Hall of Fame 掲載・生成済み画像・バッジ設定もすべて削除。
- `publicRanking=false` に切り替えた場合、Hall of Fame からは外れる（ランキング再集計時に連動）。

---

## 設計

### 動的 SVG バッジの配信戦略

- SVG をリアルタイム生成し **CDN キャッシュ**（短 TTL：5〜15 分）。スコア更新後の遅延を許容範囲に収める。
- 推奨 HTTP ヘッダ：`Cache-Control: public, max-age=300, stale-while-revalidate=600`
- GitHub の **Camo CDN を経由** するため、TTL とキャッシュ無効化の制御に制限がある点を考慮。極端な即時反映は期待しない設計に。
- バッジ生成 API は読み取り専用。書き込みは `badge_configs` 更新時のみ。
- バッジに表示する項目：`displayItems` で **グレード名・ベストスコア・全期間ランク・連続日数・累計打鍵数** から選択可能。グレード名は最も人気のオプション想定。

### 達成カード PNG の生成

- サーバーサイドで OG カード風の画像を生成。実装候補：**`satori` + `resvg-js`**（Node のみで完結、外部 GPU/AI 不要）。
- 一度生成したら **S3 等のオブジェクトストレージに保存** し、再アクセス時はそのまま返す（再生成しない）。
- `rewards.assetUrl` に S3 URL を保存。
- テンプレート：JSX で記述する HTML レイアウト + Tailwind 互換スタイル。グレードごとに色・装飾を分岐。

### Hall of Fame コメントの入力タイミング

**設計思想**：コメントは **感情のピークで取る**。プレイ完了直後のリザルト画面で、トップ 10 入りが見込まれるユーザーに即時コメント入力モーダルを出す。

#### 暫定判定とトリガー

- `POST /api/play-sessions/:id/finish` のレスポンスに **`topTenBoundaryScore`**（直近 snapshot の言語別 10 位スコア）を含める。
- クライアント側で `myScore > topTenBoundaryScore` ならコメント入力モーダルを表示。
- バッチ集計前のため「**🎉 トップ 10 入り見込み！**」と暫定であることを UI に明示。

#### draft → 公開昇格

- 入力されたコメントは `hall_of_fame_entries.commentDraft` に下書き保存（公開はしない）。
- 次の毎時バッチでトップ 10 入賞が **確定** したタイミングで `commentDraft` の中身を `comment` に昇格・公開。
- バッチで圏外に押し出された場合：`commentDraft` は保持。次に入賞したタイミングで自動公開、もしくはマイページでの再編集を促す。

#### 編集

- 入賞中は **マイページ > Hall of Fame コメント** からいつでも編集可能。
- 編集すると即座に `comment` に反映（次バッチを待たない）。
- 編集履歴は[`Hall of Fame コメントの保護`](#hall-of-fame-コメントの保護)に従い保持。

#### スキップ動線

- リザルト画面のモーダルは **「あとで書く」** で閉じられる。
- 閉じても入賞は無効化されない（バッチで自然に確定）。
- 入賞時にコメント未入力のままだとデフォルト表示は「（コメントなし）」もしくは行ごと省略。

### Hall of Fame コメントの保護

- **NG ワードフィルタ** を導入（`commentDraft` 保存時に一次、`comment` 昇格時に二次の二段チェック）。
- 長さ制限（例：300 文字）。
- 編集履歴を保持し、悪意ある書き換えに対応できるようにする。
- 表示時はサニタイズ（XSS 対策）。

### 拡散ループの計測

- シェアされた達成カード・バッジから流入したユーザーを **UTM パラメータ** でトラッキング。
- マーケ施策の効果測定に利用。
- 例：`?utm_source=github_badge&utm_medium=referral&utm_campaign=user_{userId}`

### MVP 対象外（将来検討）

以下は **MVP では実装しない**。運用負荷（制作工数 / AI API コスト / SNS API コスト / 配信設計）が高いため、MVP のユーザー獲得状況・収益・要望次第で Phase 2 以降に着手する。

- 3D オリジナルキャラの内製・配布
- Lottie アニメーションアバター
- AI トレーディングカード（背景生成）
- プロシージャル識別子アート
- 公式 X による上位者紹介自動投稿（オプトイン）

これらは UI 上で **「Coming Soon」プレースホルダ枠** だけ用意し、ユーザーに将来追加される予告を見せる。

詳細：[`./deferred-rich-rewards.md`](./deferred-rich-rewards.md)

---

## 必要な画面

| 画面 | 概要 |
| --- | --- |
| マイページ > 特典タブ | 獲得済み特典の一覧（SVG バッジ URL コピー、達成カード DL、Hall of Fame リンク）+ **Coming Soon プレースホルダ枠**（3D・Lottie・カード・アート・公式 X 紹介投稿） |
| 達成通知モーダル | プレイ完了直後に「新しい特典を獲得しました」と表示 |
| **トップ 10 入りモーダル** | リザルト画面で `myScore > topTenBoundaryScore` のときに即時表示。コメント入力 (300 字, 任意)・「あとで書く」スキップ動線あり |
| バッジカスタマイズ | バッジに表示する項目（グレード / スコア / ランク / 連続日数 / 言語）を選択 |
| Hall of Fame | 言語別の歴代トップ 10、本人コメント、リプレイへの導線 |
| マイページ > Hall of Fame コメント編集 | 入賞中ユーザー向け、`comment` を直接編集（次バッチを待たず公開） |

## 必要な API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/rewards/me` | 自分の獲得済み特典一覧 |
| POST | `/api/rewards/cards` | 達成カード PNG を生成（or 取得） |
| GET | `/badge/:username.svg` | 動的 SVG バッジ（クエリで表示項目指定可） |
| GET | `/api/hall-of-fame` | 言語別 Hall of Fame 取得 |
| POST | `/api/hall-of-fame/comments/draft` | リザルト画面から送信されるコメント下書き（`commentDraft` に保存）。バッチで入賞確定時に `comment` に昇格 |
| PATCH | `/api/hall-of-fame/comments/:entryId` | 入賞中ユーザーがコメントを編集（即時反映） |

3D アイコン生成 API（`POST /api/rewards/3d-icons`）は MVP では作らない。Phase 2 で追加検討。

## 必要な DB 設計

| テーブル | 主要カラム | 説明 |
| --- | --- | --- |
| `rewards` | `id`, `userId`, `type(badge/card/hall_of_fame)`, `payload(jsonb)`, `assetUrl(nullable)`, `grantedAt` | 獲得済み特典。`type` は MVP では 3 種類。将来 `3d` / `lottie` / `trading_card` / `procedural_art` 等を追加 |
| `hall_of_fame_entries` | `id`, `languageId`, `rank`, `userId`, `playSessionId`, `comment(nullable)`, `commentDraft(nullable)`, `featuredAt` | Hall of Fame 掲載。`commentDraft` はリザルト画面で下書き保存されたコメント。バッチで入賞確定時に `comment` に昇格 |
| `badge_configs` | `userId(PK)`, `displayItems(jsonb)`, `theme`, `updatedAt` | ユーザーごとのバッジ表示設定 |

## フロー図

```mermaid
flowchart TD
    Play[プレイ完了] --> Stats[user_lifetime_stats 更新]
    Stats --> Check{特典獲得条件をチェック}
    Check -->|グレードアップ| GenGradeCard[達成カード PNG 生成<br/>"You reached Senior Engineer!"<br/>S3 保存]
    Check -->|累計文字数 達成| GenCard[達成カード PNG 生成<br/>S3 保存]
    Check -->|score > topTenBoundary| Top10Modal[リザルト画面で<br/>トップ10入りモーダル表示<br/>コメント下書き保存]
    Check -->|常時| Badge[badge_configs 更新<br/>SVG キャッシュ無効化]
    Top10Modal --> Draft[(commentDraft 保存)]
    GenGradeCard --> Notify[マイページに通知＋DL リンク]
    GenCard --> Notify
    Badge --> CDN[CDN キャッシュ無効化]

    Batch[毎時バッチ] --> CheckBatch{ranking_snapshots で<br/>本当にトップ10?}
    CheckBatch -->|Yes| Promote[commentDraft → comment 昇格<br/>Hall of Fame 公開]
    CheckBatch -->|No| HoldDraft[draft 保持<br/>次回入賞時に再判定]
    Promote --> Notify

    User[README に貼ったバッジ閲覧者] --> CDN
    CDN -->|キャッシュヒット| Img[SVG 配信]
    CDN -->|ミス| BadgeAPI[GET /badge/:username.svg]
    BadgeAPI --> DB[(DB 読み取り)]
    BadgeAPI --> Render[SVG 生成・キャッシュ保存]
    Render --> CDN
```
