<script lang="ts">
    import { onMount } from "svelte";

    let categories = $state<
    Array<{
        id: number;
        name: string;
        description: string | null;
        threadCount: number;
    }> | null
    >(null);

    let threads = $state<
    Array<{
        id: number;
        title: string;
        createdAt: string;
        updatedAt: string;
        messageCount: number;
    }> | null
    >(null);

    // 選択されたカテゴリID
    let selectedCategoryId = $state<number | null>(null);

    // 新しいスレッドタイトル
    let newThreadTitle = $state<string>('');

    // カテゴリ一覧を読み込む
    async function loadCategories() {
        const res = await fetch('/api/categories');
        if (res.ok) {
            categories = await res.json();
            if (categories && categories.length > 0
                && selectedCategoryId === null)
            {
                selectedCategoryId = categories[0].id;
                await loadThreads(categories[0].id);
            }
        }
    }

    // スレッド一覧を読み込む
    async function loadThreads(categoryId: number) {
        threads = null; // ローディング表示のため一旦クリア
        const res = await fetch(`/api/categories/${categoryId}/threads`);
        if (res.ok) {
            threads = await res.json();
        }
    }

    // カテゴリを選択
    function selectCategory(id: number) {
        selectedCategoryId = id;
        loadThreads(id);
    }

    async function createThread() {
        if (selectedCategoryId === null) {
            alert('カテゴリを選択してください。');
            return;
        }

        if (!newThreadTitle.trim()) {
            alert('スレッドタイトルを入力してください。');
            return;
        }

        const res = await fetch(`/api/categories/${selectedCategoryId}/threads`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newThreadTitle })
        });

        if (!res.ok) {
            const text = await res.text();
            alert(`スレッド作成に失敗しました: ${text}`);
            return;
        }

        newThreadTitle = '';
        await loadThreads(selectedCategoryId);
    }

    onMount(loadCategories);
</script>

<!-- カテゴリ一覧 -->
{#if categories}
	<ul>
		{#each categories as c}
			<li>
				<button
					type="button"
					onclick={() => selectCategory(c.id)}
					class:selected={c.id === selectedCategoryId}
				>
					{c.name} ({c.threadCount} スレッド)
				</button>
			</li>
		{/each}
	</ul>
{:else}
	<p>カテゴリ読み込み中...</p>
{/if}
<!-- スレッド作成フォーム（カテゴリ選択時のみ表示） -->
{#if selectedCategoryId !== null}
	<div class="space-y-2">
		<h2>スレッド作成</h2>
		<input
			type="text"
			placeholder="スレッドタイトル"
			bind:value={newThreadTitle}
		/>
		<button type="button" onclick={createThread}>
			スレッドを作成
		</button>
	</div>
{/if}
<!-- スレッド一覧 -->
{#if threads}
	<ul>
		{#each threads as t}
			<li>{t.title} ({t.messageCount} メッセージ)</li>
		{/each}
	</ul>
{:else if selectedCategoryId !== null}
	<p>スレッド読み込み中...</p>
{:else}
	<p>カテゴリが選択されていません。</p>
{/if}