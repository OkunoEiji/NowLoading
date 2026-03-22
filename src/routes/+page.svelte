<script lang="ts">
  import { browser } from '$app/environment';
  import { invalidateAll } from '$app/navigation';
  import { PanelLeftOpen, PanelRight } from 'lucide-svelte';
  import logoN from '$lib/assets/logo-n.svg';
  import { page } from '$app/state';
  import { SignIn } from 'svelte-clerk';
  import { onDestroy, untrack } from 'svelte';
  import { fetchClerkSessionTokenForWs } from '$lib/ws/fetch-clerk-token';
  import { buildWebSocketUrlWithToken } from '$lib/ws/ws-url';

  // 型定義
  type Category = {
    id: number;
    name: string;
  };
  type Thread = {
    id: number;
    title: string;
    createdAt: string;
    createdByName?: string;
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
  type DbUser = {
    id: number;
    username: string | null;
    email: string | null;
  };

  // データロード（レイアウトの dbUser と +page.server の user をマージして扱う）
  type PageUserPayload = {
    id: number;
    username?: string | null;
    email?: string | null;
  };

  const dbUser = $derived.by(() => {
    const d = page.data as {
      dbUser?: DbUser | null;
      user?: PageUserPayload | null;
    };
    const fromLayout = d?.dbUser ?? null;
    if (fromLayout) return fromLayout;
    const u = d?.user;
    if (u?.id != null) {
      return {
        id: u.id,
        username: u.username ?? null,
        email: u.email ?? null
      } satisfies DbUser;
    }
    return null;
  });
  const dbUserId = $derived(dbUser?.id ?? null);
  
  // 選択状態
  let selectedCategoryId = $state<number | null>(null);
  let selectedThreadId = $state<number | null>(null);
  
  // 一覧データ
  let categories = $state<Category[]>([]);
  let threads = $state<Thread[]>([]);
  let messages = $state<Message[]>([]);
  
  // WebSocket 関連
  let socket = $state<WebSocket | null>(null);
  let wsStatus = $state<'disconnected' | 'connecting' | 'connected'>(
    'disconnected'
  );
  let draft = $state('');
  let result = $state<string | null>(null);
  let lastSentMessageId = $state<number | null>(null);
  /// ロゴの WS グロー（状態と実際の socket の両方を見る＝切断レース対策）
  const logoWsGlow = $derived(
    wsStatus === 'connecting' ||
      wsStatus === 'connected' ||
      (browser && socket?.readyState === WebSocket.OPEN)
  );
  /// サイドバー開閉(PCではデフォルト開く)
  let sidebarOpen = $state(true);

  /// ユーザーメニュー／モーダル
  let showUserMenu = $state(false);
  let showProfileModal = $state(false);
  let showLogoutConfirm = $state(false);
  let showLoginModal = $state(false);

  const authReturnUrl = $derived(
    (() => {
      const url = page.url.pathname + page.url.search + page.url.hash;
      return url || '/';
    })()
  );

  const anyModalOpen = $derived(
    showProfileModal || showLogoutConfirm || showLoginModal
  );

  function getClerk() : any {
    return (globalThis as any).Clerk;
  }

  $effect(() => {
    if (!browser) return;
    if (!anyModalOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  });

  $effect(() => {
    if (!browser) return;
    if (!showLoginModal) return;
    
    let done = false;
    async function onSession() {
      if (done) return;
      const clerk = getClerk();

      if (!clerk?.session) return;
      done = true;
      showLoginModal = false;
      await invalidateAll();
      void connectWebSocket({ silent: true });
    }

    const id = setInterval(() => void onSession(), 400);
    const clerk = getClerk();
    const unsub =
      typeof clerk?.addListener === 'function'
        ? clerk.addListener((em: { session?: unknown }) => {
            if (em?.session) void onSession();
          })
        : undefined;
    
    return () => {
      clearInterval(id);
      if (typeof unsub === 'function') unsub();
    };
  });

  $effect(() => {
    if (!browser || !showUserMenu) return;

    const onDocClick = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      for (const el of document.querySelectorAll('[data-user-menu-root]')) {
        if (el.contains(t)) return;
      }
      showUserMenu = false;
    };

    const tid = window.setTimeout(() => {
      document.addEventListener('click', onDocClick, true);
    }, 0);

    return () => {
      clearTimeout(tid);
      document.removeEventListener('click', onDocClick, true);
    };
  });

  async function loadCategories() {
    try {
      const res = await fetch('/api/categories');
      if (!res.ok) throw new Error(await res.text());
      categories = await res.json();
    } catch (ex) {
      console.error('カテゴリ読み込み失敗', ex);
    }
  }

  async function loadThreads(categoryId: number) {
    selectedThreadId = null;
    messages = [];
    try {
      const res = await fetch(`/api/categories/${categoryId}/threads`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      threads = data.map((t: any) => ({
        id: t.id,
        title: t.title,
        createdAt: t.createdAt,
        createdByName: t.createdBy?.username
      }));
    } catch (ex) {
      console.error('スレッド読み込み失敗', ex);
    }
  }

  async function loadMessages(threadId: number) {
    try {
      const res = await fetch(
        `/api/threads/${threadId}/messages?includeDeleted=true`
      );
      if (!res.ok) throw new Error(await res.text());
      messages = await res.json();
    } catch (ex) {
      console.error('メッセージ読み込み失敗', ex);
    }
  }
  
  $effect(() => {
    loadCategories();
  });

  async function connectWebSocket(opts?: { silent?: boolean }) {
    if (!browser) return;

    if (
      untrack(
        () =>
        wsStatus === 'connected'
        || wsStatus === 'connecting'
        || socket?.readyState === WebSocket.OPEN
      )
    ) {
      return;
    }

    wsStatus = 'connecting';
    if (!opts?.silent) result = null;

    const token = await fetchClerkSessionTokenForWs();
    if (!token) {
      wsStatus = 'disconnected';
      if (!opts?.silent) {
        result =
          'WebSocket: トークン取得に失敗しました。（未ログインか Clerk 未初期化）';
      }
      return;
    }

    let ws: WebSocket;
    try {
      const url = buildWebSocketUrlWithToken(token);
      if (import.meta.env.DEV) {
        try {
          const { hostname, port } = new URL(url.replace(/^ws/i, 'http'));
          console.debug('[ws] opening', `${hostname}:${port || (url.startsWith('wss') ? '443' : '80')}`);
        } catch {
          console.debug('[ws] opening (url parse skipped)');
        }
      }
      ws = new WebSocket(url);
    } catch (ex) {
      console.error('WebSocket の生成に失敗', ex);
      wsStatus = 'disconnected';
      return;
    }
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
          if (lastSentMessageId !== null && created.id === lastSentMessageId) {
            return;
          }
          messages = [...messages, created];
        }
      } catch (ex) {
        console.error('WebSocketメッセージ解析失敗', ex);
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

  function disconnectWebSocket() {
    if (!browser) return;

    try {
      socket?.close();
    } catch(ex) {
      console.warn('WebSocket切断失敗', ex);
    }
    socket = null;
    wsStatus = 'disconnected';
  }

  /**
   * WS はサーバー側で JWT のみ検証する。Clerk セッションがあれば接続を試す。
   * （page.data の dbUser が遅れて null のままの瞬間に切ってしまうと Network に WS が現れない）
   */
  $effect(() => {
    if (!browser) return;

    let canceled = false;
    const tryAutoConnect = () => {
      if (canceled) return;
      const clerk = getClerk();
      if (!clerk?.session) return;
      if (
        untrack(
          () =>
            socket?.readyState === WebSocket.OPEN ||
            wsStatus === 'connected' ||
            wsStatus === 'connecting'
        )
      ) {
        return;
      }
      void connectWebSocket({ silent: true });
    };

    const clerk = getClerk();
    const unsub =
      typeof clerk?.addListener === 'function'
        ? clerk.addListener((em: { session?: unknown }) => {
            if (!em?.session) {
              disconnectWebSocket();
              return;
            }
            tryAutoConnect();
          })
        : undefined;

    // ハイドレーション直後は session がまだのことがあるので複数フレームで試す
    queueMicrotask(tryAutoConnect);
    requestAnimationFrame(tryAutoConnect);
    const t = window.setTimeout(tryAutoConnect, 500);

    return () => {
      canceled = true;
      clearTimeout(t);
      if (typeof unsub === 'function') unsub();
    };
  });

  onDestroy(() => {
    if (browser) disconnectWebSocket();
  });

  async function sendMessage() {
    if (!draft.trim() || !selectedThreadId) return;
    try {
      const res = await fetch(`/api/threads/${selectedThreadId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft.trim() })
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const created = JSON.parse(text) as Message;
      messages = [...messages, created];
      lastSentMessageId = created.id;
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
      console.error('メッセージ送信失敗', ex);
      result =
        '送信エラー: ' + (ex instanceof Error ? ex.message : String(ex));
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

<div class="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50">
  <div class="flex-1 flex min-h-0">
    <!-- サイドバー -->
    <aside
      class={`hidden lg:block fixed inset-y-0 left-0 z-40 overflow-visible
          bg-white/90 border-r border-gray-200 backdrop-blur-md
          w-64 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-[13rem]'}`}
    >
      <!-- サイドバー開閉ボタン（右上）※折りたたみ時の全高ラッパーより手前に -->
      <button
        type="button"
        class="absolute top-3 right-3 z-[70] w-7 h-7 rounded-full bg-white border border-gray-200 shadow flex items-center justify-center text-gray-600 hover:bg-gray-50 transition"
        onclick={() => (sidebarOpen = !sidebarOpen)}
        aria-label="Toggle sidebar"
      >
        {#if sidebarOpen}
          <PanelRight size={20} />
        {:else}
          <PanelLeftOpen size={20} />
        {/if}
      </button>
      {#if sidebarOpen}
        <!-- サイドバー開いているとき：カテゴリ・スレッド・ユーザー情報 -->
        <div class="h-full flex flex-col pt-4">
          <!-- カテゴリ／スレッド一覧 -->
          <div class="flex-1 overflow-y-auto text-sm">
            <div class="px-4 pt-2 pb-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
              カテゴリ
            </div>
            <div class="px-2 space-y-1">
              {#each categories as cat}
                <button
                  type="button"
                  class="w-full flex items-center gap-2 px-3 py-2 rounded-lg
                        text-left text-xs
                        {selectedCategoryId === cat.id
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'text-gray-700 hover:bg-gray-50'}"
                  onclick={() => handleCategoryClick(cat)}
                >
                  <span class="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[11px]">
                    {cat.name.slice(0, 1)}
                  </span>
                  <span class="truncate">{cat.name}</span>
                </button>
              {/each}
            </div>
            {#if selectedCategoryId}
              <div class="px-4 pt-4 pb-2 mt-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-t border-gray-100">
                スレッド
              </div>
              <div class="px-2 space-y-1">
                {#if !threads.length}
                  <p class="px-3 py-2 text-[11px] text-gray-400">
                    スレッドがありません。
                  </p>
                {:else}
                  {#each threads as th}
                    <button
                      type="button"
                      class="w-full flex flex-col gap-0.5 px-3 py-2 rounded-lg
                            text-left text-xs
                            {selectedThreadId === th.id
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : 'text-gray-700 hover:bg-gray-50'}"
                      onclick={() => handleThreadClick(th)}
                    >
                      <span class="font-semibold truncate">{th.title}</span>
                      <span class="text-[10px] text-gray-500 truncate">
                        {th.createdByName ?? '名無しさん'}・
                        {new Date(th.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
          <!-- ユーザー情報（常にボトム）※ data-user-menu-root 内クリックはメニューを閉じない -->
          <div
            class="px-4 py-3 border-t border-gray-200 relative"
            data-user-menu-root
          >
            {#if dbUser}
              <!-- メニューを上側に表示（ポップアップ風） -->
              {#if showUserMenu}
                <div
                  class="absolute bottom-full left-4 right-4 mb-1
                        text-xs bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-10"
                >
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 hover:bg-gray-50 rounded-t-xl"
                    onclick={() => {
                      showUserMenu = false;
                      showProfileModal = true;
                    }}
                  >
                    設定
                  </button>
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 text-red-600 hover:bg-red-50 rounded-b-xl"
                    onclick={() => {
                      showUserMenu = false;
                      showLogoutConfirm = true;
                    }}
                  >
                    ログアウト
                  </button>
                </div>
              {/if}
              <button
                type="button"
                class="w-full flex items-center gap-3 px-2 py-2 rounded-xl bg-gradient-to-r from-gray-50 to-blue-50 hover:shadow-md transition"
                onclick={() => (showUserMenu = !showUserMenu)}
              >
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold">
                  {(dbUser.username ?? '??').slice(0, 2)}
                </div>
                <div class="text-xs text-left flex-1">
                  <p class="font-medium">
                    {dbUser.username ?? 'User'}
                  </p>
                  <p class="text-gray-500 truncate">
                    {dbUser.email ?? ''}
                  </p>
                </div>
              </button>
            {:else}
              <button
                type="button"
                class="w-full flex items-center gap-3 px-2 py-2 rounded-xl bg-gradient-to-r from-gray-50 to-blue-50 hover:shadow-md transition"
                onclick={() => (showLoginModal = true)}
              >
                <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold">
                  ?
                </div>
                <div class="text-xs text-left flex-1">
                  <p class="font-medium">ログインしていません</p>
                  <p class="text-blue-600">Login</p>
                </div>
              </button>
            {/if}
          </div>
        </div>
      {:else}
        <!-- 折りたたみ時：全高ラッパーはクリックを透過（開閉ボタンが押せるように） -->
        <div
          class="pointer-events-none relative h-full w-full flex flex-col justify-end pb-4"
          data-user-menu-root
        >
          <div class="pointer-events-auto flex justify-end pr-2">
            <button
              type="button"
              class="relative z-[61] w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold shadow shrink-0"
              onclick={() => {
                if (dbUser) showUserMenu = !showUserMenu;
                else showLoginModal = true;
              }}
            >
              {#if dbUser}
                {(dbUser.username ?? '??').slice(0, 2)}
              {:else}
                ?
              {/if}
            </button>
          </div>
          {#if dbUser && showUserMenu}
            <div
              class="pointer-events-auto absolute bottom-4 left-full z-[60] ml-1 flex min-w-[8.5rem] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
              role="menu"
            >
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-[11px] text-gray-800 hover:bg-gray-50"
                role="menuitem"
                onclick={() => {
                  showUserMenu = false;
                  showProfileModal = true;
                }}
              >
                設定
              </button>
              <button
                type="button"
                class="w-full px-3 py-2 text-left text-[11px] text-red-600 hover:bg-red-50"
                role="menuitem"
                onclick={() => {
                  showUserMenu = false;
                  showLogoutConfirm = true;
                }}
              >
                ログアウト
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </aside>
    <!-- メインコンテンツ -->
    <div
      class={`flex-1 flex min-h-0 flex-col transition-all duration-200
                ${sidebarOpen ? 'ml-0 lg:ml-64' : 'ml-0 lg:ml-12'}`}
    >
      <section class="flex-1 flex flex-col min-h-0">
        <!-- タイトル（親に overflow-hidden を付けない→ロゴの drop-shadow が切れない） -->
        <div class="px-6 pt-4 pb-2 flex items-center gap-3 shrink-0">
          <div
            class="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center overflow-visible ring-0"
          >
            <img
              src={logoN}
              alt="NowLoading logo"
              class={`w-5 h-5 n-logo ${logoWsGlow ? 'n-logo--glow' : ''}`}
            />
          </div>
          <div class="flex flex-col">
            <span class="text-base font-semibold text-gray-900">
              NowLoading
            </span>
            <span class="text-[11px] text-gray-500">
              {#if selectedThreadId}
                スレッド: {threads.find((t) => t.id === selectedThreadId)?.title ?? ''}
              {:else if selectedCategoryId}
                カテゴリ: {categories.find((c) => c.id === selectedCategoryId)?.name ?? ''}
              {:else}
                カテゴリを選択してください
              {/if}
            </span>
          </div>
          <div class="flex-1"></div>
        </div>
        <!-- メインコンテンツ（スクロール領域だけクリップ） -->
        <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
          <!-- コンテンツ -->
          <div class="flex-1 overflow-y-auto min-h-0">
            <!-- カテゴリ選択 -->
            {#if !selectedCategoryId}
              <div class="flex flex-col items-center justify-center h-full px-4">
                <div class="max-w-2xl w-full text-center space-y-6">
                  <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                    <img
                      src={logoN}
                      alt="NowLoading logo"
                      class={`n-logo ${logoWsGlow ? 'n-logo--glow' : ''}`}
                    />
                  </div>
                  <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Now Loading へようこそ
                  </h1>
                  <p class="text-sm text-gray-500">
                    気になるトピックを選んで、エンジニア同士で会話を始めましょう。
                  </p>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                    {#each categories as cat}
                      <button
                        type="button"
                        class="p-4 rounded-2xl bg-white/80 border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all text-left"
                        onclick={() => handleCategoryClick(cat)}
                      >
                        <div class="flex items-center gap-3">
                          <div class="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                            {cat.name.slice(0, 1)}
                          </div>
                          <div>
                            <p class="text-sm font-semibold text-gray-900">
                              {cat.name}
                            </p>
                            <p class="text-[11px] text-gray-400">
                              スレッド一覧を表示
                            </p>
                          </div>
                        </div>
                      </button>
                    {/each}
                  </div>
                </div>
              </div>
            {:else if !selectedThreadId}
              <!-- スレッド一覧 -->
              <div class="flex flex-col h-full">
                <div class="px-6 pt-3 flex items-center justify-between border-b border-gray-200 bg-white/70">
                  <button
                    type="button"
                    class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    onclick={handleBackToCategories}
                  >
                    ← カテゴリ一覧に戻る
                  </button>
                  <span class="text-[11px] text-gray-500">
                    {
                      categories.find((c) => c.id === selectedCategoryId)?.name ??
                        'カテゴリ'
                    } のスレッド
                  </span>
                </div>
                <div class="flex-1 overflow-y-auto px-6 py-4">
                  {#if !threads.length}
                    <div class="h-full flex items-center justify-center text-sm text-gray-500">
                      このカテゴリにはまだスレッドがありません。
                    </div>
                  {:else}
                    <div class="max-w-3xl mx-auto space-y-3">
                      {#each threads as th}
                        <button
                          type="button"
                          class="w-full text-left p-4 rounded-2xl bg-white/90 border border-gray-200 hover:shadow-md hover:-translate-y-[1px] transition-all"
                          onclick={() => handleThreadClick(th)}
                        >
                          <div class="flex items-center justify-between gap-2">
                            <div class="flex-1">
                              <p class="text-sm font-semibold text-gray-900">
                                {th.title}
                              </p>
                              <p class="text-[11px] text-gray-500 mt-1">
                                {th.createdByName ?? '名無しさん'}・
                                {new Date(th.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <span class="text-[11px] text-gray-400">▶</span>
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              </div>
            {:else}
              <!-- メッセージ -->
              <div class="flex flex-col h-full">
                <div class="px-6 pt-3 flex items-center justify-between border-b border-gray-200 bg-white/70">
                  <button
                    type="button"
                    class="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1"
                    onclick={handleBackToThreads}
                  >
                    ← スレッド一覧へ
                  </button>
                  <span class="text-[11px] text-gray-500">
                    threadId: {selectedThreadId}
                  </span>
                </div>
                <div class="flex-1 overflow-y-auto">
                  <div class="max-w-3xl mx-auto px-6 py-6 space-y-4">
                    {#if !messages.length}
                      <div class="h-[calc(100vh-260px)] flex items-center justify-center">
                        <div class="text-center space-y-3 max-w-md">
                          <h2 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                            会話を始めましょう
                          </h2>
                          <p class="text-sm text-gray-500">
                            このスレッドで最初のメッセージを投稿して、議論をスタートしてください。
                          </p>
                        </div>
                      </div>
                    {:else}
                      {#each messages as msg}
                        <div class="flex gap-3">
                          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                            {(msg.authorUserName ?? '？').slice(0, 2)}
                          </div>
                          <div class="flex-1">
                            <div class="flex items-center gap-2">
                              <span class="text-xs font-semibold text-gray-800">
                                {msg.authorUserName ?? '名無しさん'}
                              </span>
                              <span class="text-[10px] text-gray-400">
                                {new Date(msg.updatedAt).toLocaleString()}
                              </span>
                            </div>
                            <div class="mt-1 rounded-2xl bg-white/90 border border-gray-200 px-4 py-3 text-sm text-gray-800 whitespace-pre-wrap">
                              {msg.content}
                            </div>
                          </div>
                        </div>
                      {/each}
                    {/if}
                  </div>
                </div>
              </div>
            {/if}
          </div>
          {#if selectedThreadId && dbUser}
            <!-- 入力エリア（メッセージ画面＝スレッド選択時のみ） -->
            <div class="border-t border-gray-200 bg-white/90 backdrop-blur-md">
              <div class="max-w-3xl mx-auto px-6 py-3">
                <div class="flex flex-col gap-2">
                  <div class="flex flex-col md:flex-row gap-2 items-stretch md:items-end">
                    <textarea
                      rows={2}
                      bind:value={draft}
                      placeholder="メッセージを入力..."
                      class="flex-1 px-3 py-2 rounded-xl border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    ></textarea>
                    <button
                      type="button"
                      onclick={sendMessage}
                      class="w-full md:w-auto px-4 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 text-white text-sm font-medium hover:shadow-md hover:scale-105 transition-all disabled:opacity-50"
                      disabled={!draft.trim()}
                    >
                      送信
                    </button>
                  </div>
                  {#if result}
                    <p class="text-[11px] text-red-500">{result}</p>
                  {/if}
                </div>
              </div>
            </div>
          {/if}
        </div>
      </section>
    </div>
  </div>
  <!-- ========== 【修正 C】設定モーダル ========== -->
  {#if showProfileModal}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      role="presentation"
      onclick={(e) => {
        if (e.target === e.currentTarget) showProfileModal = false;
      }}
      onkeydown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showProfileModal = false;
        }
      }}
    >
      <div
        class="w-full max-w-md bg-white rounded-2xl shadow-xl p-6"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        <h2 id="profile-modal-title" class="text-lg font-semibold mb-4">
          ユーザー設定
        </h2>
        {#if dbUser}
          <div class="space-y-3 text-sm">
            <div>
              <label class="block text-xs font-medium mb-1" for="profile-username">ユーザー名</label>
              <input
                id="profile-username"
                type="text"
                value={dbUser.username ?? ''}
                class="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-sm"
                disabled
              />
            </div>
            <div>
              <label class="block text-xs font-medium mb-1" for="profile-email">メールアドレス</label>
              <input
                id="profile-email"
                type="email"
                value={dbUser.email ?? ''}
                class="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-sm"
                disabled
              />
            </div>
            <p class="text-[11px] text-gray-500">
              プロフィールの詳細編集は今後追加予定です。
            </p>
          </div>
        {/if}
        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50"
            onclick={() => (showProfileModal = false)}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  {/if}
  <!-- ========== 【修正 D】ログアウト確認モーダル ========== -->
  {#if showLogoutConfirm}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      role="presentation"
      onclick={(e) => {
        if (e.target === e.currentTarget) showLogoutConfirm = false;
      }}
      onkeydown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showLogoutConfirm = false;
        }
      }}
    >
      <div
        class="w-full max-w-sm bg-white rounded-2xl shadow-xl p-6 text-sm"
        role="dialog"
        tabindex="-1"
        aria-modal="true"
      >
        <h2 class="text-base font-semibold mb-3">ログアウトしますか？</h2>
        <p class="text-xs text-gray-600 mb-4">
          再度ログインするまで、メッセージ投稿などの機能は利用できなくなります。
        </p>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 text-xs rounded-lg border border-gray-300 hover:bg-gray-50"
            onclick={() => (showLogoutConfirm = false)}
          >
            キャンセル
          </button>
          <button
            type="button"
            class="px-4 py-2 text-xs rounded-lg bg-red-500 text-white hover:bg-red-600"
            onclick={async () => {
              disconnectWebSocket();
              const clerk = (globalThis as any).Clerk;
              await clerk?.signOut?.();
              showLogoutConfirm = false;
              location.reload();
            }}
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  {/if}
  <!-- ========== 【修正 E】ログインモーダル：iframe 廃止 → SignIn（親タブでセッション共有） ========== -->
  {#if showLoginModal}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div
        class="w-full max-w-[420px] max-h-[90vh] flex flex-col bg-white rounded-2xl shadow-xl overflow-hidden"
      >
        <div
          class="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0"
        >
          <span id="login-modal-title" class="text-sm font-semibold">ログイン</span>
          <button
            type="button"
            class="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
            onclick={() => (showLoginModal = false)}
          >
            ✕
          </button>
        </div>
        <div class="overflow-y-auto min-h-0 flex-1 p-2">
          <SignIn
            afterSignInUrl={authReturnUrl}
            afterSignUpUrl={authReturnUrl}
          />
        </div>
      </div>
    </div>
  {/if}
</div>