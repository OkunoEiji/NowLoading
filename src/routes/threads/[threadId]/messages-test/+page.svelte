<script lang="ts">
    import { page } from '$app/state';
    import { browser } from '$app/environment';

    type PageData = {
        dbUser?: {
            id: number;
        } | null;
    };
    
    const { data }: { data: PageData } = $props();
    const threadId = $derived(page.params.threadId);

    let messages = $state<Array<{
        id: number;
        threadId: number;
        authorId: number;
        authorUserName: string | null;
        content: string;
        updatedAt: string;
        deletedAt: string | null;
    }>>([]);

    let loading = $state(true);
    let error = $state<string | null>(null);
    let result = $state<string | null>(null);
    let editingId = $state<number | null>(null);
    let editContent = $state('');

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
        
        ws.onopen = () => {
            console.log('WebSocket connected');
            result = 'WebSocket: 接続成功';
        };

        ws.onmessage = (event) => {
            console.log('WS message', event.data);
        };

        ws.onclose = () => {
            console.log("WebSocket closed");
        };

        ws.onerror = (error) => {
            console.error('WebSocket error', error);
            result = 'WebSocket 接続エラーが発生しました。';
        };  
    }

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
</script>

<div class="wrap">
    <h1>メッセージ取得・削除・編集テスト (threadId: {threadId})</h1>
    <button onclick={connectWebSocket}>
        WebSocket 接続テスト
    </button>
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