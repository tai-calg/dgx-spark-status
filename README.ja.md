# DGX Spark Status Dashboard

[English](README.md) | **日本語**

NVIDIA DGX Spark (GB10) 向けのリアルタイム監視ダッシュボード。CPU、統合メモリ、GPU、ディスク、ネットワーク、プロセス、llama.cpp、vLLM、Ollama の状態をブラウザから確認できる。

![Dashboard Screenshot](docs/dashboard-screenshot.png)

## このForkの位置づけ

このリポジトリは、元プロジェクトをローカル・プライベート環境で安全に運用できるように修正したセキュリティ強化Forkである。

主な変更点は以下。

- デフォルトでは `127.0.0.1:9000` のみにbindする
- LAN/リモート公開は明示的なopt-inとする
- リモートアクセス時は認証必須とし、トークン未設定ではfail-closedで拒否する
- Ollama操作でシェル文字列展開を使わず、`execFile()` と引数配列を使用する
- Ollama操作・モデルメモ更新へのcross-originリクエストを拒否する
- 完全なプロセスコマンドラインやローカルモデルの絶対パスをブラウザへ送信しない
- 開発用と本番用でAPI実装が分岐しないよう、旧 `dev-server.js` を廃止する

脅威モデルと運用上の注意は [SECURITY.md](SECURITY.md) を参照。

## 機能

### システム監視

- CPU使用率・コア別負荷
- 統合メモリ使用量
- `nvidia-smi` によるNVIDIA GPU使用率・温度・消費電力
- ディスク使用量
- ネットワーク送受信量
- メモリ使用量の大きいプロセス一覧
- システム稼働時間

### 推論エンジン

- llama.cpp のサーバー状態・ロード中モデル
- vLLM のコンテナ・モデル状態
- Ollama のモデル一覧・ロード・アンロード・pull・delete
- モデル単位のメモ

### UI

- Server-Sent Events (SSE) による1秒間隔の更新
- コンパクトなレスポンシブダッシュボード
- ダークテーマ
- モデル一覧カード

## 必要環境

- Linux
- Ubuntu 24.04 ARM64 / DGX Spark GB10 を主な対象環境として想定
- プロジェクト依存関係に対応するNode.js
- NVIDIA Driver と `nvidia-smi`
- 使用する機能に応じて Ollama / llama.cpp / vLLM

## ローカル起動

```bash
git clone https://github.com/tai-calg/dgx-spark-status.git
cd dgx-spark-status
npm install
npm run dev
```

ブラウザで以下へアクセスする。

```text
http://127.0.0.1:9000
```

デフォルトではloopbackにしか公開されないため、同一LAN上の別端末からもアクセスできない。

## LAN内からアクセスする

十分に長いランダムトークンを設定した上で、リモートbindを明示的に有効化する。

```bash
export DGX_ALLOW_REMOTE=1
export DGX_DASHBOARD_TOKEN='replace-with-a-random-secret-at-least-16-characters-long'
npm run dev
```

この場合、サーバーは `0.0.0.0:9000` にbindし、HTTP Basic認証を要求する。

- ユーザー名: `dgx`
- パスワード: `DGX_DASHBOARD_TOKEN` の値

HTTP Basic認証そのものは通信を暗号化しない。9000番ポートをインターネットへ直接公開しないこと。信頼できないネットワーク越しに利用する場合は、TLSを終端するリバースプロキシまたはVPNを使用する。

ポートは `DGX_PORT` で変更できる。

## 本番起動

```bash
npm run build
npm start
```

本番サーバーにも同じloopback/remote-accessポリシーが適用される。

## テスト

```bash
npm test
```

セキュリティ回帰テストでは、少なくとも以下を検証する。

- デフォルトがloopback bindであること
- リモート公開時に認証設定がなければ起動を拒否すること
- 認証判定が正しく動作すること
- Ollama管理APIでシェル文字列展開を使用しないこと

## API

### `GET /api/metrics`

ダッシュボード用メトリクスをSSEで配信する。リモートアクセス時は認証ポリシーによって保護される。

### `GET|POST /api/notes`

モデル単位のメモを読み書きする。

デフォルト保存先:

```text
/opt/dgx-spark-status/model-notes.json
```

`DGX_NOTES_FILE` で保存先を変更できる。

### `POST /api/ollama`

対応する操作:

- `pull`
- `delete`
- `load`
- `unload`

モデル識別子を検証した上で、シェルを介さずOllama実行ファイルへ引数として渡す。

## セキュリティ上の注意

このForkは元実装より安全側へ変更しているが、監視ダッシュボード自体がホスト情報・GPU状態・推論モデル状態を扱うため、公開Webサービスとしての利用を前提としていない。

推奨構成は以下。

1. 単一マシンだけで使う場合はデフォルトの `127.0.0.1` bindを維持する
2. LAN越しに使う場合のみ `DGX_ALLOW_REMOTE=1` を有効化する
3. 信頼できないネットワークを跨ぐ場合はVPNまたはTLS付きリバースプロキシを使用する
4. `DGX_DASHBOARD_TOKEN` をGitリポジトリへコミットしない

## Credits

Originally created by Phanes / Viroscope at OnticEntia.ai and later extended by thx0701.

このリポジトリは `tai-calg` が独立して保守するセキュリティ強化Forkである。

## License

MIT
