# Seonology Clock Page

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md)

Seonology Clock Pageは、時計、ブックマーク、開発ツール、インフラ情報、ファイルブラウザー、チャットを備えた個人向けの運用ダッシュボードです。nginxを使う一つのコンテナでReactとExpress APIを実行します。リポジトリにはSeonology Toolkit拡張と、タブ統計を収集する別のブラウザー拡張もあります。

管理元はGiteaの`seonology/k3s-managed-seonology-clock-page`です。push mirrorは`sync_on_commit: true`でブランチとタグをGitHubの`seonNoh/k3s-managed-seonology-clock-page`にコピーします。

![実行時アーキテクチャ](docs/svg/architecture.ja.svg)

## 実行時アーキテクチャとリポジトリ構成

nginxはポート`8080`でViteのビルドを配信し、`/api/`と`/health`を`127.0.0.1:3001`のExpressへ転送します。`tini`はnginxと`api/server.js`を管理するシェルを起動します。どちらかが終了すると、シェルは両方のプロセスを停止します。`/health`はAPIの応答を返します。イメージはUID/GID `10001`を使用し、中央のKubernetes Deploymentがルートファイルシステムを読み取り専用に設定します。

| パス | 役割 |
|---|---|
| `src/` | Split/Classic画面、時計テーマ、Webツール、埋め込みツール |
| `api/` | Expressルート、連携クライアント、JSON・画像の永続ストレージ |
| `packages/toolkit-core/` | ツール情報、表示場所、Markdownユーティリティー |
| `toolkit-extension/` | ポップアップ、新しいタブ、コンテキストメニューを備えたManifest V3拡張 |
| `chrome-extension/` | タブ統計の収集とタブ切り替え用の独立した拡張 |
| `scripts/` | コンテナのスモークテスト、リリース計画・公開、トークンのバックアップ復元 |
| `k8s/` | 参照用マニフェストです。Argo CDは後述の中央GitOpsパスを使用します。 |

## ツールとAPIルート

SplitとClassicには検索、天気、ブックマーク、視覚効果があります。時計カタログは12種類のテーマを定義します。WebランチャーとToolkit拡張は同じカタログを使い、表示場所ごとのローダーを接続します。一部のIDは異なります。Webの`subnet`、`textcounter`、`excel`、`ip`は、拡張の`cidr`、`textcount`、`excel2md`、`iplookup`に対応します。

![ツールの表示場所対応表](docs/svg/tool-landscape.ja.svg)

`/?embed=1&tool=<id>`または`/?embed=true&tool=<id>`で開くと、ダッシュボードを表示せずにWebツールを一つ開きます。たとえば`/?embed=1&tool=json`はJSONフォーマッターを開きます。埋め込みにはWebツールのIDを使います。Toolkit拡張は`npm run build --prefix toolkit-extension`で生成した`toolkit-extension/dist`から読み込みます。

| API | 用途 |
|---|---|
| `GET /health`, `GET /api/services` | 状態応答とKubernetesサービスの検索 |
| `GET/PUT /api/bookmarks` | ブックマーク全体です。分類・項目別のルートで追加・編集・削除を行います。 |
| `/api/todos`, `/api/notes`, `/api/chat/history` | タスク、メモ、会話履歴の永続化 |
| `GET /api/chat/models`, `POST /api/chat/gemini` | モデル一覧とGeminiチャット |
| `POST /api/chat/{provider}` | 対応ハーネスのAgent Platformチャット |
| `GET /api/infra/{cluster,tailscale,nas}` | インフラの状態 |
| `/api/nas/*`, `/api/gdrive/*`, `/api/onedrive/*` | ファイル一覧、フォルダー操作、アップロード、ダウンロード |
| `GET /api/auth/{google,microsoft}` | OAuth認証です。コールバックは末尾に`/callback`が付きます。 |
| `GET/POST /api/clipboard/images`, `GET/DELETE /api/clipboard/images/:id` | クリップボード画像の保存 |
| `GET /api/github/repos`, `GET /api/github/repos/stream`, `POST /api/github/repos/refresh` | リポジトリ一覧、SSE、更新 |
| `GET /api/briefing/{latest,mails,events,stream}` | WorklogブリーフィングとSSE通知 |
| `GET /api/jma/*`, `GET /api/sapporo-events/*`, `GET /api/suggest` | 気象警報、イベント、検索候補 |
| `GET /api/icons/{index,svg}`, `GET/POST /api/browser-stats` | アイコンのプロキシとブラウザー拡張の統計 |

リポジトリ一覧は起動5秒後から、既定で5分ごとに更新します。イベント収集も起動5秒後に始まり、その後24時間ごとに実行します。ブリーフィングは60秒間キャッシュし、NATSの`work.briefing.>`通知を受信します。

## ローカル開発

Node.js `>=24.15 <25`が必要です。`.nvmrc`は`24.15.0`を指定します。ルート、API、Toolkitのロックファイルは独立しています。依存関係をそれぞれインストールし、フロントエンドとAPIを別々のターミナルで起動します。

```sh
npm ci
npm ci --prefix api
npm ci --prefix toolkit-extension
npm run dev
# In another terminal
npm run dev --prefix api
```

`http://localhost:5173`を開きます。WebのAPIクライアントは、ホスト名が`localhost`のときに`http://localhost:3001`を使います。ViteにはAPIプロキシがありません。APIの既定ポートは`3001`で、`PORT`で変更します。実行時設定はプロセスの環境変数から読み込みます。認証情報は追跡対象のファイルに保存しないでください。

## 品質チェック

リポジトリ契約は、READMEの構造、同一のコマンドブロック、言語別の画像リンク、SVGの配置規則を検査します。管理ファイル、ワークフローの境界、GitHubワークフローのチェックサムも対象です。Gitea CIはリンター、単体・API・ブラウザーテスト、ビルド、実行時依存関係の監査、コンテナのスモークテストも実行します。

```sh
python3 verify.py --repository .
npm run lint
npm run test:unit
npm run test:api
npm run test:e2e
npm run build
npm audit --omit=dev --audit-level=high
npm audit --prefix api --omit=dev --audit-level=high
npm audit --prefix toolkit-extension --omit=dev --audit-level=high
npm run smoke:container
```

`npm run test:e2e`は`pretest:e2e`でToolkit拡張をビルドします。ブラウザーテストにはPlaywright Chromiumが必要です。コンテナのスモークテストにはDockerが必要です。HTTPの状態、読み取り専用マウント、API停止後の状態リクエスト失敗を確認します。CIは実行時依存関係の監査で、深刻度high以上の指摘があると失敗します。

## 実行時設定

| 変数 | 既定値または用途 |
|---|---|
| `PORT`, `BOOKMARKS_DIR` | `3001`, `/data` |
| `CORS_ALLOWED_ORIGINS` | カンマ区切りのオリジンです。既定値は`https://clock.seonology.com`、`http://localhost:5173`、`http://127.0.0.1:5173`です。 |
| `CLOUD_TOKEN_ENCRYPTION_KEY` | クラウドトークンの暗号化キー |
| `CLIPBOARD_DIR`, `CLIPBOARD_MAX_IMAGE_BYTES`, `CLIPBOARD_MAX_TOTAL_BYTES`, `CLIPBOARD_MAX_ITEMS` | `/data/clipboard`、25 MiB、256 MiB、100です。ディレクトリは`BOOKMARKS_DIR`に従います。 |
| `GEMINI_API_KEY`, `AGENT_PLATFORM_URL`, `AGENT_TOKEN_URL`, `AGENT_CLIENT_ID`, `AGENT_CLIENT_SECRET` | Gemini・Agent Platformの認証情報と接続先です。Agent APIの既定値は`http://agent-api.agent-platform.svc.cluster.local:8080`です。 |
| `AGENT_TIMEOUT_MS`, `AGENT_POLL_INTERVAL_MS` | `180000`、`1000`です。トークン発行先の既定値は`https://auth.seonology.com/realms/master/protocol/openid-connect/token`です。 |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | Google Drive OAuthです。コールバックの既定値は`https://clock.seonology.com/api/auth/google/callback`です。 |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_REDIRECT_URI` | OneDrive OAuthです。コールバックの既定値は`https://clock.seonology.com/api/auth/microsoft/callback`です。 |
| `NAS_HOST`, `NAS_PORT`, `NAS_ACCOUNT`, `NAS_PASSWORD`, `NAS_ALLOWED_ROOTS`, `NAS_CA_PATH`, `NAS_TLS_SERVERNAME` | NAS接続、許可パス、TLSの設定です。ポートの既定値は`5001`です。 |
| `NAS_MAX_UPLOAD_BYTES`, `NAS_MAX_UPLOAD_FILES` | 11 GiB、1ファイル |
| `GRAFANA_URL`, `GRAFANA_USER`, `GRAFANA_PASS`, `TAILSCALE_OAUTH_CLIENT_ID`, `TAILSCALE_OAUTH_CLIENT_SECRET` | インフラ連携です。GrafanaのURLの既定値は`https://grafana.seonology.com`です。 |
| `GITHUB_CATALOG_TOKEN`, `CATALOG_INTERVAL_MS` | 一覧取得用トークンと更新間隔`300000`です。トークンの代替値は`GITHUB_TOKEN`です。 |
| `WORKLOG_API_BASE`, `WORKLOG_CLIENT_CERT_FILE`, `WORKLOG_CLIENT_KEY_FILE`, `NATS_URL`, `NATS_USER`, `NATS_PASSWORD` | WorklogのmTLS接続とNATSのブリーフィング購読 |
| `ICONS_BASE`, `DOORKEEPER_TOKEN`, `CONNPASS_API_KEY` | アイコンサービスの既定値`http://seonology-svg-studio`とイベント連携 |

`BOOKMARKS_DIR`には`bookmarks.json`、`todos.json`、`notes.json`、`chat-history.json`、`cloud-tokens.json`、`clipboard-images.json`と画像ディレクトリを保存します。nginxのリクエスト上限は通常1 MiB、クリップボード32 MiB、NAS・Driveアップロード12 GiBです。APIはファイル単位の上限を適用します。

## CI/CDとリリース

![ワークフローの実行分岐](docs/svg/delivery.ja.svg)

| ワークフロー / ジョブ | トリガー | 手順と結果 |
|---|---|---|
| `.gitea/workflows/ci.yml` / `quality` | `main`へのpush、`main`宛てのpull request、`workflow_dispatch` | チェックアウト → Node 24確認 → 依存関係3組のインストール → リポジトリ規則 → リンター・単体・API → Chromium・ブラウザー → Webビルド → 実行時依存関係の監査 → コンテナのスモークテスト |
| `.gitea/workflows/image.yml` / `publish` | `main`へのpush、`workflow_dispatch` | チェックアウト → リポジトリ規則 → 複数プラットフォーム用ビルダー → レジストリログイン → 公開 → プラットフォーム確認です。`linux/amd64`と`linux/arm64`、タグ`main`と`sha-<12 hex>`を使います。 |
| `.gitea/workflows/release.yml` / `release` | `v*`タグのpush、必須入力`tag`付きの`workflow_dispatch` | チェックアウト → タグ・VERSION確認 → リポジトリ規則 → ビルダー → ログイン → イメージの有無確認・公開 → プラットフォーム確認 → リリースの有無確認・作成 |

`main`へのpushでCIとImageは独立して開始します。ワークフロー間に成功を待つ依存関係やdispatchの連鎖はありません。イメージ名は`git.seonology.com/seonology/seonology-clock-page`です。Releaseは`X.Y.Z`が`VERSION`と一致する`vX.Y.Z`だけを受け付けます。イメージがなければバージョンタグでビルドします。Giteaリリースがなければ、直近50件のコミットタイトルからリリースノートを作成して公開します。

Giteaワークフローはバージョンの増分を計算しません。`scripts/release-gate.mjs`の計画処理は、`feat`をマイナー、`fix`・`chore`・`refactor`・`docs`・`perf`をパッチとして扱います。互換性のない変更は1.x以降でメジャー、0.xではマイナーです。ビルドのバージョンは`VERSION`から読み込みます。非公開パッケージの`package.json`は`0.0.0`を維持します。

## 中央GitOpsによるデプロイ

Argo CD Application `seonology-clock-page`は、`https://git.seonology.com/seonology/seonology-k3s.git`のリビジョン`HEAD`、パス`workloads/seonology-clock-page`を読み込みます。デプロイ先は名前空間`seonology-apps`です。自動同期は`prune`と`selfHeal`を使います。Kustomizationは`git.seonology.com/seonology/seonology-clock-page:sha-7192892f4d21`を指定します。

ApplicationのImage Updater注釈は、別途`ghcr.io/seonnoh/seonology-clock-page`、`semver`方式、`main`へのgit write-back、Kustomizationを指定します。Giteaのイメージワークフローは、Gitea Registryのイメージと12桁SHAタグを公開します。

![アクセスとストレージの境界](docs/svg/security-boundaries.ja.svg)

Traefikは`clock.seonology.com`に`kube-system/keycloak-auth`とTLS設定`kube-system/seonology-tls-no-mtls`を適用します。API・状態ルートの優先度は`200`です。UIの優先度は`10`で、コンソール埋め込みミドルウェアを追加します。この設定は`https://www.seonology.com`からのフレーム表示を許可します。ClusterIP Serviceはポート`80`をnginxの名前付き`http`ポート`8080`に接続します。

Deploymentはレプリカ1個、`Recreate`、UID/GID `10001`、capabilityの全削除、権限昇格の禁止、`RuntimeDefault` seccompを設定します。`clock-bookmarks-cp`は64 MiBの`local-path` PVCで、`/data`にマウントします。Podは`backup.velero.io/backup-volumes: bookmarks-data`を宣言します。`/tmp`、`/var/cache/nginx`、`/var/run/nginx`は`emptyDir`です。External Secretsは`vault-cluster`経由でVaultを読み、1時間ごとに更新します。Worklog証明書は`/cred/worklog`に読み取り専用でマウントします。サービスアカウントはIngress、IngressRoute、ノード、ノードメトリクスに対する読み取り専用の`get/list`権限を持ちます。

Agent Platformの`agent-api-ingress` NetworkPolicyは、名前空間`seonology-apps`で`app: seonology-clock-page`ラベルを持つPodから、Agent APIのTCP `8080`への接続を許可します。

## コントリビューションとライセンス

コミットタイトルは英語のConventional Commit形式で、本文は変更理由と影響を韓国語で記載します。READMEの節順、コマンドブロック、図ごとの3言語版をそろえてください。図は既存のファイル名とpediaの項目を使って更新します。

[MIT License](LICENSE)を適用します。貢献方法は[CONTRIBUTING.md](CONTRIBUTING.md)、文書の構造は[README_STRUCTURE.md](README_STRUCTURE.md)に記載しています。
