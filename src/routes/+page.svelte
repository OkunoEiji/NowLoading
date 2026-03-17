<script lang="ts">
    import { page } from '$app/state';
    import { browser } from '$app/environment';

    /// 型定義
    type Category = { id: number; name: string };
    type Thread = {
        id: number;
        title: string;
        createdAt: string;
        createdByName: string;
    };
    type Message = {
        id: number;
        threadId: number;
        authorId: number;
        authorUserName: string | null;
        content: string;
        updatedAt: string;
        deletedAt: string | null;
    };

    /// 選択されたカテゴリID
    let selectedCategoryId = $state<number | null>(null);
    /// 選択されたスレッドID
    let selectedThreadId = $state<number | null>(null);

    /// 一覧データ
    let categories = $state<Category[]>([]);
    let threads = $state<Thread[]>([]);
    let messages = $state<Message[]>([]);

    /// WebSocket関連
    let socket = $state<WebSocket | null>(null);
    let draft = $state('');
    let wsStatus = $state<'disconnected' | 'connecting' | 'connected'>('disconnected');
    let result = $state<string | null>(null);
    let lastSendMessageId = $state<number | null>(null);

    /// TODO: APIに対して中身書き換え
    /// カテゴリ一覧を読み込む
    async function loadCategories() {
        try {
            const response = await fetch('/api/categories');
            if (!response.ok) return;
            categories = await response.json();
        } catch (ex) {
            console.error('failed to load categories', ex);
        }
    }

    /// TODO: APIに対して中身書き換え
    /// スレッド一覧を読み込む
    async function loadThreads(categoryId: number) {
        selectedThreadId = null;
        messages = [];

        try {
            const response = await fetch(`/api/categories/${categoryId}/threads`);
            if (!response.ok) throw new Error(await response.text());
            const data = await response.json();
            threads = data.map((thread: any) => ({
                id: thread.id,
                title: thread.title,
                createdAt: thread.createdAt,
                createdByName: thread.createdByName
            }));
        } catch (ex) {
            console.error('failed to load threads', ex);
        }
    }

    /// TODO: APIに対して中身書き換え
    /// メッセージ一覧を読み込む
    async function loadMessages(threadId: number) {
        try {
            const response = await fetch(`/api/threads/${threadId}/messages?includeDeleted=true`);
            if (!response.ok) throw new Error(await response.text());
            messages = await response.json();
        } catch (ex) {
            console.error('failed to load messages', ex);
        }
    }

    $effect(() => {
        loadCategories();
    });

    /// WebSocket接続
    async function connectWebSocket() {
        if (!browser) return;
        if (wsStatus === 'connected' || wsStatus === 'connecting') return;

        wsStatus = 'connecting';
        result = null;
        
        const clerk = (globalThis as any).Clerk;
        const token = await clerk?.session.getToken();
        if (!token) {
            result = 'WebSocket: トークン取得に失敗しました。';
            wsStatus = 'disconnected';
            return;
        }

        const ws = new WebSocket(
            `ws://localhost:3001/ws?token=${encodeURIComponent(token)}`
        );
        socket = ws;

        ws.onopen = () => {
            wsStatus = 'connected';
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'message-created') {
                    const created = msg.message as Message;
                    if (String(created.threadId) !== String(selectedThreadId)) return;
                    // 自分が直前に送ったメッセージならスキップ（2重表示防止）
                    if (lastSendMessageId !== null && created.id === lastSendMessageId) {
                        return;
                    }
                    messages = [...messages, created];
                }
            } catch (ex) {
                console.error('failed to parse ws message', ex);
            }
        };

        ws.onclose = () => {
            wsStatus = 'disconnected';
            socket = null;
        };

        ws.onerror = (error) => {
            console.error('WebSocket error', error);
            wsStatus = 'disconnected';
            result = 'WebSocket 接続エラーが発生しました。';
        };
    }

    /// メッセージ送信
    async function sendMessage() {
        if (!draft.trim() || !selectedThreadId) return;

        try {
            const response = await fetch(`/api/threads/${selectedThreadId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: draft.trim() })
            });

            const text = await response.text();
            if (!response.ok) throw new Error(text);
            const created = JSON.parse(text) as Message;

            /// 自分の画面には即時反映
            messages = [...messages, created];
            lastSendMessageId = created.id;

            /// WebSocketが開いていれば通知
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.send(
                    JSON.stringify({
                        type: 'message-created',
                        threadId: created.threadId,
                        message: created
                    })
                );
            }

            draft = '';
            result = null;
        } catch (ex) {
            console.error('sendMessage error', ex);
            result ='送信エラー: ' + (ex instanceof Error ? ex.message : String(ex));
        }
    }

    function handleCategoryClick(category: Category) {
        selectedCategoryId = category.id;
        selectedThreadId = null;
        messages = [];
        loadThreads(category.id);
    }

    function handleThreadClick(thread: Thread) {
        selectedThreadId = thread.id;
        loadMessages(thread.id);
    }

    function handleBackToCategories() {
        selectedCategoryId = null;
        selectedThreadId = null;
        threads = [];
        messages = [];
    }

    function handleBackToThreads() {
        selectedThreadId = null;
        messages = [];
    }
</script>

<main class="app-main">
    <div class="max-w-6xl mx-auto">
      <!-- ヘッダー -->
      <header class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center"
          >
            <span class="text-white font-bold text-lg">DF</span>
          </div>
          <div class="flex flex-col">
            <span
              class="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
            >
              Dev Forum
            </span>
            <span class="text-xs text-gray-500">
              {#if selectedThreadId}
                スレッド: {
                  threads.find((t) => t.id === selectedThreadId)?.title ?? ''
                }
              {:else if selectedCategoryId}
                カテゴリ: {
                  categories.find((c) => c.id === selectedCategoryId)?.name ?? ''
                }
              {:else}
                カテゴリを選択してください
              {/if}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="text-xs px-3 py-1 rounded-full border
                 {wsStatus === 'connected'
                   ? 'border-green-500 text-green-600'
                   : wsStatus === 'connecting'
                     ? 'border-yellow-500 text-yellow-600'
                     : 'border-gray-300 text-gray-500'}"
          onclick={connectWebSocket}
        >
          WS: {wsStatus}
        </button>
      </header>
      <!-- コンテンツ 3段階切り替え -->
      {#if !selectedCategoryId}
        <!-- カテゴリ一覧 -->
        <section class="app-card">
          <h2 class="text-2xl font-bold mb-4">カテゴリを選択</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {#each categories as cat}
              <button
                class="group p-5 bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl hover:shadow-xl hover:-translate-y-1 transition-all duration-200"
                onclick={() => handleCategoryClick(cat)}
              >
                <div
                  class="w-10 h-10 mb-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                >
                  {cat.name.slice(0, 1)}
                </div>
                <div class="text-left">
                  <h3
                    class="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors"
                  >
                    {cat.name}
                  </h3>
                </div>
              </button>
            {/each}
          </div>
        </section>
      {:else if !selectedThreadId}
        <!-- スレッド一覧 -->
        <section class="app-card">
          <button
            type="button"
            class="flex items-center gap-2 mb-6 text-blue-600 hover:text-blue-700 text-sm"
            onclick={handleBackToCategories}
          >
            ← カテゴリ一覧に戻る
          </button>
          <h2 class="text-2xl font-bold mb-4">
            {
              categories.find((c) => c.id === selectedCategoryId)?.name ??
                'カテゴリ'
            } のスレッド一覧
          </h2>
          {#if !threads.length}
            <p class="text-sm text-gray-500">スレッドがありません。</p>
          {:else}
            <div class="space-y-3">
              {#each threads as th}
                <button
                  class="w-full p-4 rounded-xl border border-gray-200 text-left hover:bg-gray-50 transition-all"
                  onclick={() => handleThreadClick(th)}
                >
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-semibold text-gray-900">{th.title}</p>
                      <p class="text-xs text-gray-500 mt-1">
                        {th.createdByName ?? '名無しさん'}・
                        {new Date(th.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span class="text-xs text-gray-400">▶</span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}
        </section>
      {:else}
        <!-- メッセージ画面 -->
        <section class="app-card flex flex-col h-[calc(100vh-9rem)]">
          <div class="flex items-center justify-between mb-4">
            <button
              type="button"
              class="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
              onclick={handleBackToThreads}
            >
              ← スレッド一覧へ
            </button>
            <div class="text-xs text-gray-500">
              threadId: {selectedThreadId}
            </div>
          </div>
          <!-- メッセージ一覧 -->
          <div
            class="flex-1 min-h-[200px] max-h-full overflow-y-auto space-y-3 border border-gray-100 rounded-xl p-3 bg-gray-50 text-sm"
          >
            {#if !messages.length}
              <p class="text-gray-500">まだメッセージがありません。</p>
            {:else}
              {#each messages as msg}
                <div class="px-3 py-2 rounded-lg bg-white border border-gray-200">
                  <div class="flex items-center justify-between">
                    <span class="font-medium">
                      {msg.authorUserName ?? '名無しさん'}
                    </span>
                    <span class="text-[10px] text-gray-400">
                      {new Date(msg.updatedAt).toLocaleString()}
                    </span>
                  </div>
                  <p class="mt-1 text-gray-800 whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              {/each}
            {/if}
          </div>
          <!-- 入力フォーム -->
          <div class="mt-4 space-y-2">
            <div class="flex gap-2 items-end">
              <textarea
                rows={2}
                bind:value={draft}
                placeholder="メッセージを入力..."
                class="flex-1 px-3 py-2 rounded-xl border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              ></textarea>
              <button
                type="button"
                onclick={sendMessage}
                class="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium hover:shadow-md hover:scale-105 transition-all disabled:opacity-50"
                disabled={!draft.trim()}
              >
                送信
              </button>
            </div>
            {#if result}
              <p class="text-xs text-red-500">{result}</p>
            {/if}
          </div>
        </section>
      {/if}
    </div>
  </main>