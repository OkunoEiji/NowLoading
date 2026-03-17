<script lang="ts">
    import { page } from '$app/state';
    import { browser } from '$app/environment';
	import { MySqlFloat } from 'drizzle-orm/mysql-core';

    type PageData = {
        dbUser?: {
            id: number;
        } | null;
    };
    
    const { data }: { data: PageData } = $props();
    const threadId = $derived(page.params.threadId);

    // メッセージの型定義
    type Message = {
        id: number;
        threadId: number;
        authorId: number;
        authorUserName: string | null;
        content: string;
        updatedAt: string;
        deletedAt: string | null;
    };

    let messages = $state<Message[]>([]);
    let loading = $state(true);
    let error = $state<string | null>(null);
    let result = $state<string | null>(null);
    let editingId = $state<number | null>(null);
    let editContent = $state('');
    // WebSocket インスタンス
    let socket = $state<WebSocket | null>(null);
    // 新規メッセージ入力欄
    let draft = $state('');

    const dbUser = $derived(data?.dbUser);

    // Clerkトークン取得
    async function getClerkToken(): Promise<string | null> {
        if (!browser) return null;
        const clerk = (globalThis as any).Clerk;
        if (!clerk?.session) return null;
        return await clerk.session.getToken();
    }

    async function connectWebSocket() {
        if (!browser) return;

        const token = await getClerkToken();
        if (!token) {
            console.error('Clerk トークンが取得できません（未ログインか、Clerk 未初期化）');
            result = 'WebSocket: トークン取得に失敗しました。';
            return;
        }

        const ws = new WebSocket(
            `ws://localhost:3001/ws?token=${encodeURIComponent(token)}`
        );
        socket = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'message-created') {
                    const created = msg.message as Message;
                    if (String(created.threadId) === String(threadId)) {
                        messages = [...messages, created];
                    }
                }
            } catch (e) {
                console.error('failed to parse ws message', e);
            }
        };
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            result = 'WebSocket: 接続成功';
        };

        ws.onclose = () => {
            console.log("WebSocket closed");
            socket = null;
        };

        ws.onerror = (error) => {
            console.error('WebSocket error', error);
            result = 'WebSocket 接続エラーが発生しました。';
        };  
    }

    // メッセージ一覧を取得(削除済みも含める)
    async function loadMessages() {
        if (!threadId) return;

        loading = true;
        error = null;

        try {
            const res = await fetch(`/api/threads/${threadId}/messages?includeDeleted=true`);
            if (!res.ok) throw new Error(await res.text());

            messages = await res.json();
        } catch (ex) {
            error = ex instanceof Error ? ex.message : String(ex);
        } finally {
            loading = false;
        }
    }

    $effect(() => {
        if (threadId) loadMessages();
    });

    // メッセージを削除
    async function deleteMessage(messageId: number) {
        result = null;
        try {
            const res = await fetch(`/api/threads/${threadId}/messages/${messageId}`, { method: 'DELETE' });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            result = '削除しました。一覧を再取得します。';
            await loadMessages();
        } catch (ex) {
            result = 'エラー:' + (ex instanceof Error ? ex.message : String(ex));
        }
    }

    // メッセージを編集
    async function saveEdit(messageId: number) {
        result = null;
        try {
            const res = await  fetch(`/api/threads/${threadId}/messages/${messageId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent.trim() })
            });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            result = '編集しました。一覧を再取得します。';
            editingId = null;
            editContent = '';
            await loadMessages();
        } catch (ex) {
            result = 'エラー:' + (ex instanceof Error ? ex.message : String(ex));
        }
    }

    // メッセージを復元
    async function restoreMessage(messageId: number) {
        result = null;
        try {
            const res = await fetch(`/api/threads/${threadId}/messages/${messageId}/restore`, { method: 'PATCH' });
            const text = await res.text();
            if (!res.ok) throw new Error(text);
            result = '復元しました。一覧を再取得します。';
            await loadMessages();
        } catch (ex) {
            result = 'エラー:' + (ex instanceof Error ? ex.message : String(ex));
        }
    }

    function startEdit(msg: { id: number; content: string }) {
        editingId = msg.id;
        editContent = msg.content;
    }

    async function sendMessageViaRest() {
        if (!draft.trim()) return;
        // メッセージ作成用の POST エンドポイントを用意（例）
        const res = await fetch(`/api/threads/${threadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: draft.trim() })
        });
        if (!res.ok) {
            result = '送信エラー: ' + (await res.text());
            return;
        }
        const created = await res.json(); // DB に保存されたメッセージ
        // 1. 画面に即時反映（楽観的UI）
        messages = [...messages, created];

        // 2. WebSocket がつながっていれば「新着通知」を流す
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'message-created',
                threadId: created.threadId,
                message: created
            }));
        }

        draft = '';
    }

    async function sendMessage() {
        if (!draft.trim()) return;

        // 1. REST でメッセージ作成（+server.ts 側に POST を用意しておく）
        const res = await fetch(`/api/threads/${threadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: draft.trim() })
        });
        const text = await res.text();
        if (!res.ok) {
            result = '送信エラー: ' + text;
            return;
        }
        const created = JSON.parse(text) as Message;

        // 2. 自分の画面には即時反映
        messages = [...messages, created];

        // 3. WebSocket が開いていれば「新着通知」を送る（通知専用）
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({
                type: 'message-created',
                threadId: created.threadId,
                message: created
            }));
        }

        draft = '';
    }
</script>

<div class="wrap">
    <h1>メッセージ取得・削除・編集テスト (threadId: {threadId})</h1>
    <button onclick={connectWebSocket}>
        WebSocket 接続テスト
    </button>
    <div class="ws-send">
        <input
            placeholder="WebSocket で送るメッセージ..."
            bind:value={draft}
        />
        <button onclick={sendMessageViaRest}>
            WebSocket 送信
        </button>
    </div>
    {#if !dbUser}
        <p>ログインすると削除・編集できます。</p>
    {/if}
    {#if result}<p class="result">{result}</p>{/if}
    {#if error}<p class="error">{error}</p>{/if}
    {#if loading}
        <p>読み込み中...</p>
    {:else}
        <ul>
            {#each messages as msg (msg.id)}
                <li>
                    <span>
                        ID: {msg.id}
                        | {msg.authorUserName ?? '?'}
                        | {msg.content}
                        | updated: {msg.updatedAt}
                        {#if msg.deletedAt}
                            | 削除済み: {msg.deletedAt}
                        {/if}
                    </span>
                    {#if dbUser && msg.authorId === dbUser.id}
                        {#if msg.deletedAt}
                            <!-- 削除済み → 復旧だけ表示 -->
                            <button onclick={() => restoreMessage(msg.id)}>
                                復旧
                            </button>
                        {:else}
                            <!-- 未削除 → 削除・編集ボタン -->
                            {#if editingId === msg.id}
                                <input bind:value={editContent} />
                                <button onclick={() => saveEdit(msg.id)}>保存</button>
                                <button
                                    onclick={() => {
                                        editingId = null;
                                        editContent = '';
                                    }}
                                >
                                    キャンセル
                                </button>
                            {:else}
                                <button onclick={() => deleteMessage(msg.id)}>
                                    削除
                                </button>
                                <button onclick={() => startEdit(msg)}>
                                    編集
                                </button>
                            {/if}
                        {/if}
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>