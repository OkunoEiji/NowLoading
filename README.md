# 設計内容
# 1. プロダクト基本方針
　◆目的
　　エンジニアの技術共有を目的としたカテゴリ型リアルタイム掲示板チャットアプリ
　◆想定ユーザー
　　ロール　　　できること
　　Admin　　　　全操作 + ロール変更
　　ユーザー1　　スレッド作成・投稿
　　ユーザー2　　カテゴリ作成・スレッド作成・投稿
　　未登録　　　　閲覧のみ

# 2. スケール想定
　◆同時接続数：200人まで
　◆メッセージ保存期間：無限
　◆単一インスタンス構成（Railway）
　　Redis等は現時点では不要。

# 3. 技術スタック（確定）
　項目　　　　　　採用
　フロント　　　　Svelte 5
　フルスタック　　SvelteKit
　DB	　　　　 PostgreSQL
　ORM	　　　　 Prisma
　WebSocket　　　ws
　認証　　　　　　Clerk
　デプロイ　　　　Railway

# 4. 情報構造（IA）
　Slack型にはしない。
　構造は固定：
　　カテゴリ
　　　└ スレッド
　　　└ メッセージ
　メッセージに返信ツリーは持たせない。
　
　これにより：
　　　データ構造が単純
　　　クエリが軽量
　　　UIが安定

# 5. データモデル設計方針
　ロール設計
　採用方式：roles テーブル + user_roles テーブル
　　　　　　users に role カラムは持たせない。
　理由
　　将来ロール追加可能
　　多重ロール対応可能
　　権限拡張に強い
　
　ユーザー
　　初回登録：Clerk初回ログイン時にDB作成。
　　デフォルトロール　→ ユーザー1
　　
　　Clerk同期ポリシー：初回ログイン時、DBに存在しなければ作成
　　以後ログイン時：Clerk情報と差分比較
　　　　変更があればDB更新（Webhookは使わない）

　メッセージ
　　削除ポリシー：
　　　　論理削除（deleted_at nullable）
　　　　編集（updated_at）
　　履歴テーブルは作らない。
　　
　　並び順保証：フロントは created_atではなく id順
　　　理由：同時投稿時に時刻ズレが起きない（DBが順序保証する）
　　　インデックス（重要）：index on messages(thread_id, id desc)
　　　　　　　　　　　理由：無限保存対応（スレッド単位取得高速化）

# 6. 国際化（i18n）
　◆方針
　　UIのみ翻訳
　　　　投稿メッセージは翻訳しない
　　　　ユーザーがブラウザ翻訳を使用
　　翻訳保存：しない。
　　翻訳APIも使わない。

# 7. 認証・WebSocket
　◆WebSocket認証方式
　　接続時に Clerk JWT を検証。
　　独自認証は作らない。
　◆セッション管理
　　接続ごとに保持：user_id
　　　　　　　　　　role
　　　　　　　　　　current_thread_id
　◆再接続ポリシー
　　再接続時：最後の message_id を保持
　　　　　　　それ以降をAPIで再取得し、重複表示を防ぐ。

# 8. 権限チェック
　共通 authorize() 関数を作る。
　各API / WebSocketイベントで必ず実行。

　　例：authorize(user, "CREATE_THREAD")
　　　　フロントの表示制御は補助であり、本番判定は必ずバックエンド

# 9. UI/UX方針
　レスポンシブ設計：最初から対応。スマホ対応前提。
　表示構造
　　カテゴリ一覧→スレッド一覧→メッセージ一覧→入力フォーム

　並び順：メッセージは id昇順

# 10. デプロイ
　Railway単一構成。
　SvelteKit
　PostgreSQL
　同一プロジェクト内。

# 11. セキュリティ方針
　すべての権限はバックエンドでチェック
　Prisma使用でSQLインジェクション回避
　XSS対策：メッセージはHTMLレンダリングしない（基本テキスト）

# 12. テスト最低限
　最初にやるテスト：ロール別操作可否、メッセージ保存確認、WebSocket接続認証、再接続時の差分取得
　E2Eは後回し。

# 最終決定事項まとめ（完全版）
✅ 同時200接続
✅ 無限保存
✅ Svelte5 + SvelteKit
✅ PostgreSQL + Prisma
✅ WebSocket = ws
✅ roles + user_roles
✅ 初回登録 = ユーザー1
✅ Clerk差分同期
✅ 論理削除 + updated_at
✅ メッセージは id順
✅ messages(thread_id, id desc) index
✅ 翻訳しない（UIのみ）
✅ Clerk JWT検証
✅ 再接続は last_message_id以降取得
✅ authorize()共通化
✅ レスポンシブ対応
✅ Railwayデプロイ