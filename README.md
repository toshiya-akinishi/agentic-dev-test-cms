# agentic-dev-test-cms

**J-Tour Fan App** のバックエンド（CMS / API / テストデータ）。Payload CMS v3（Next.js App Router 同梱）+ SQLite で構築され、41 コレクション・カスタム認証（2FA・SNS連携）・ランキング/通知/広告/計測などのカスタム API を提供する。

## 技術スタック

- Payload CMS v3（Next.js App Router 同梱、Next.js 16 / React 19）
- SQLite（`@payloadcms/db-sqlite`）
- TypeScript

## 計画・仕様

実装は [agentic-dev-test-hub](https://github.com/toshiya-akinishi/agentic-dev-test-hub) の計画ドキュメントに従う。

| ドキュメント | 内容 |
|---|---|
| [05-wbs.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/05-wbs.md) | **タスク分解（作業指示書）** |
| [02-data-model.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/02-data-model.md) | **コレクション設計 + ロール別アクセス制御** |
| [03-api-spec.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/03-api-spec.md) | API 仕様 |
| [06-test-data.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/06-test-data.md) | **テストデータ仕様（seed）** |
| [09-decisions.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/09-decisions.md) | **ADR（設計判断の記録）** |
| [requirements/](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/requirements/REQ-INDEX.md) | 機能別 要求仕様書（97 要求 + 補完要件 208 件） |

進捗管理: [hub の Issues](https://github.com/toshiya-akinishi/agentic-dev-test-hub/issues)（このリポジトリの担当 Epic は EP-01〜EP-03, EP-16 ほか）

## 作業ブランチ

`feature/test1`

---

## セットアップ

### 前提条件

- Node.js **>= 20.9.0**（`package.json` の `engines.node` を参照。リポジトリに `.nvmrc` はない）
- pnpm（動作確認は 10.x で実施）

### 1. 環境変数（`.env`）

`.env.example` をコピーして `.env` を作成する。

```bash
cp .env.example .env
```

| 変数 | 説明 |
|---|---|
| `PAYLOAD_SECRET` | Payload がセッション/トークンの署名に使う秘密鍵。ローカル開発では任意の文字列でよいが、本番では必ず変更する。 |
| `DATABASE_URI` | SQLite の接続先。既定値 `file:./jtour.db`（リポジトリ直下にファイルが作られる）。 |
| `NEXT_PUBLIC_SERVER_URL` | サーバの公開 URL（既定 `http://localhost:3000`）。 |
| `CORS_ORIGINS` | CORS 許可オリジン（カンマ区切り）。モバイルアプリ（Expo）の開発サーバなどを指定する。 |
| `SEED` | seed スクリプトの乱数シード。固定値なので、同じ値なら毎回同じデータが生成される（決定的）。 |
| `SEED_USER_PASSWORD` | seed で作成するテストユーザー全員に設定されるパスワード（既定 `Passw0rd!`）。 |

### 2. 依存関係のインストール

```bash
pnpm install
```

### 3. 開発サーバ起動

```bash
pnpm dev
```

Next.js / Payload が起動し、管理画面（Admin UI）は **http://localhost:3000/admin** で利用できる。

### 4. 管理者ユーザーの作成

このリポジトリでは `pnpm seed`（後述）が最初から管理者アカウントを含むテストユーザー一式を作成するため、Payload の「初回アクセス時に管理者作成を促す」フローは実質使わない。

- まだ seed を実行していない状態で `/admin` に初めてアクセスすると、Payload が管理者アカウント作成画面を表示する。任意のメール/パスワードで作成してよい。
- **推奨**: 先に `pnpm seed`（または `pnpm seed:reset`）を実行し、下記の「テストアカウント」にある `admin@example.com` でログインする（ロール別の動作確認をするならこちらが必須）。

---

## テストデータの投入（seed）

```bash
pnpm seed         # 既存 DB に追記（初回実行や、DB が空の状態を想定）
pnpm seed:reset   # jtour.db と media/ の中身を削除してから実行（完全に作り直す）
```

- `seed` と `seed:reset` の違いは **DB/メディアファイルの事前削除の有無**だけで、生成ロジックは同じ。同じ `SEED`（`.env` の `SEED=20260915`）に対して常に同じ内容が生成される（**決定的・冪等**）。DB の状態が壊れた/古くなったと感じたら `seed:reset` で作り直すのが安全。
- 所要時間: **約 3 分**（ショット生成が最も時間がかかる。実測 158 秒）。
- 完了時にコンソールへ「網羅観点チェックリスト」（大会ステータス5種、動画タグ8種、開催中大会シナリオの検証など）が出力され、全 PASS であることを確認できる。

### 生成される主なデータ（直近の実行結果より）

| 項目 | 件数 | 備考 |
|---|---|---|
| tournaments（大会） | 10 | うち **1 大会が `live`**（優勝争い・カットライン際どい選手・ホールインワン等のドラマチックなシナリオ入り） |
| players（選手） | 80 | |
| shots（ショット） | 約 23,400 件 | Trackman 値あり/なし・動画あり/なしを両方含む |
| videos（動画） | 120 | ショット/ハイライト/縦型/選手ストーリー |
| scores（スコア） | 約 1,770 件 | playing/finished/cut/wd/dq の5ステータスを網羅 |
| pairings（組み合わせ） | 644 | |
| notifications（通知） | 30 | 6種別・未読を含む |
| ad-creatives / ad-slots | 20 / 5 | 全広告枠に有効なクリエイティブあり |
| analytics-events | 500 | |
| ユーザー | **8アカウント（5ロール）** | 下記「テストアカウント」参照 |

（正確な最新の件数は `pnpm seed:reset` 実行後にコンソールへ出力される「件数」ブロックを参照。上記は 2026-09-16 時点の実行結果。）

---

## テストアカウント（`src/seed/users.ts`）

ロールベースアクセス制御（RBAC）の確認用に、5ロール・8アカウントが seed される。**パスワードは全員共通で `.env` の `SEED_USER_PASSWORD`（既定 `Passw0rd!`）。ローカル検証専用のダミー認証情報であり、本番には絶対に投入しないこと。**

| ロール | メールアドレス | 表示名 | 備考 |
|---|---|---|---|
| admin | `admin@example.com` | 管理者アカウント | |
| editor | `editor@example.com` | 編集者アカウント | |
| operator | `operator@example.com` | 運営アカウント | |
| sponsor | `sponsor@example.com` | スポンサー担当者 | 特定の `sponsor` レコードに紐付け済み（自社データのみ閲覧可の確認用） |
| fan | `fan1@example.com` | ファン太郎 | 2FA 無効。お気に入り選手8件 |
| fan | `fan2@example.com` | ファン花子 | **2FA 有効**（TOTP シークレット `JBSWY3DPEHPK3PXP` を seed 済み、ダミー値）。お気に入り選手10件（上限） |
| fan | `fan3@example.com` | ファン次郎 | 2FA 無効。お気に入り0件（下限ケース） |
| fan | `fan4@example.com` | ファン美咲 | 2FA 無効。お気に入り選手6件 |

---

## 主要な npm スクリプト（`package.json`）

| コマンド | 説明 |
|---|---|
| `pnpm dev` | 開発サーバ起動（Next.js + Payload、Admin UI は `/admin`） |
| `pnpm build` | 本番ビルド |
| `pnpm start` | 本番ビルドの起動（`build` 後に実行） |
| `pnpm typecheck` | `tsc --noEmit` による型チェックのみ |
| `pnpm generate:types` | コレクション定義から `payload-types.ts` を生成 |
| `pnpm generate:importmap` | Admin UI 用の importmap を再生成（カスタムコンポーネント追加時） |
| `pnpm seed` | テストデータ投入（既存 DB に追記） |
| `pnpm seed:reset` | DB/メディアを削除してからテストデータを再投入 |

---

## カスタム API エンドポイント

標準の Payload REST（`/api/<collection>`）に加えて、以下のカスタムエンドポイントを実装している（実装は `src/endpoints/*.ts`、コレクションに登録されているものは `src/collections/*.ts` の `endpoints` 配列）。

| Method | Path | 概要 |
|---|---|---|
| POST | `/api/guest/merge` | ゲスト（`deviceId`）の favorites/likes/notification-settings/device-tokens/inquiries をログインユーザーに引き継ぐ |
| POST | `/api/auth/2fa/enroll` | 2段階認証（TOTP）の登録開始。シークレットと otpauth URL を発行（未確定状態） |
| POST | `/api/auth/2fa/verify` | TOTP コードを検証して2FAを有効化し、リカバリコード10個を発行 |
| POST | `/api/auth/2fa/disable` | TOTP またはリカバリコードで2FAを無効化 |
| POST | `/api/auth/2fa/login-verify` | ログイン時の第2段階認証（TOTPコード） |
| POST | `/api/auth/2fa/login-recovery` | ログイン時の第2段階認証（リカバリコード） |
| POST | `/api/auth/social/:provider` | SNS連携（**モック**。`google`/`apple`/`line`）。`mode=login` でログイン、`mode=link` で連携情報を記録 |
| POST | `/api/users/me/delete` | 退会。論理削除+関連データの物理削除/匿名化（`password` をボディで確認） |
| GET | `/api/rankings/latest` | ランキング種別（`type`）ごとの最新スナップショットを返す（誰でも閲覧可） |
| GET | `/api/players/cut-probability` | 開催中ラウンドのカット通過確率をリクエスト時に都度算出（保存しない） |
| GET | `/api/playlists/auto` | 指定ラウンド×選手のショット動画を自動並び替えして返す再生リスト（非永続） |
| GET | `/api/ads/serve` | 広告枠（`slot`）に配信する1件のクリエイティブを選択して返す |
| POST | `/api/analytics-events/batch` | 計測イベントのバッチ登録（最大200件/リクエスト）+ GA4への転送（モック） |
| GET | `/api/reports/sponsor` | スポンサー向けレポート集計（表示回数/クリック数/CTR/視聴時間など） |
| POST | `/api/notifications/emergency` | 運営（operator）による緊急通知の発行。ユーザーの通知設定に関わらず全員配信 |
| POST | `/api/notifications/run-checks` | 通知発火ジョブのオンデマンド実行（cron の代替。全量再評価し未生成の通知のみ作成） |
| GET | `/api/notifications/me` | ログインユーザー/ゲスト向けの通知一覧（既読/未読、未読件数） |
| POST | `/api/notifications/mark-read` | 通知の既読化 |

---

## アーキテクチャ上の注意点

詳細な設計判断は hub リポジトリの ADR（[09-decisions.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/09-decisions.md)）、データモデルは [02-data-model.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/02-data-model.md)、API 全体仕様は [03-api-spec.md](https://github.com/toshiya-akinishi/agentic-dev-test-hub/blob/feature/test1/docs/03-api-spec.md) を参照。特に新規参入者が引っかかりやすい点として:

- **エンドポイントのルーティング衝突（ADR-020）**: Payload はパスの先頭セグメントを最初にコレクション/global の slug として解決する。そのため `/api/rankings/latest` のような「先頭セグメントが既存コレクションの slug と一致するパス」を `src/endpoints/index.ts`（ルートレベルの `config.endpoints`）に登録すると、`rankings` コレクション標準の `GET /:id`（`id="latest"` 扱い）にルーティングを奪われてしまい 500 になる。この形のエンドポイント（`rankings/latest`, `players/cut-probability`, `playlists/auto`, `analytics-events/batch`, `users/me/delete`, `notifications/*`）は必ず**該当コレクション自身の `endpoints` 配列に相対パスで登録する**（例: `Rankings.ts` の `endpoints: [rankingsLatestEndpoint]` に `path: '/latest'`）。逆に `ads`, `guest`, `reports`, `auth` のように衝突しうる同名コレクションが存在しないものは `src/endpoints/index.ts` にルート登録してよい。実装中に複数回踏まれた既知の落とし穴なので、新規エンドポイント追加時は必ずこの規約に従うこと。
- **seed の決定性**: `src/seed/*.ts` は `.env` の `SEED` 値からシード付き乱数を生成しており、同じ `SEED` なら常に同じデータ・同じ選手ID・同じ「開催中大会」のドラマチックなシナリオ（優勝争い/カットライン際どい選手/ホールインワン）が再現される。テストや自動チェック（`src/seed/checklist.ts`）はこの決定性に依存しているため、`SEED` を変えると `06-test-data.md` に記載の期待値と噛み合わなくなる点に注意。
