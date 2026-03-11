<script lang="ts">
	import { onMount } from "svelte";

    let categories = $state<Array<{
        id: number;
        name: string;
        description: string | null;
        threadCount: number;
    }> | null>(null);

    let threads = $state<Array<{
        id: number;
        title: string;
        createdAt: string;
        updatedAt: string;
        messageCount: number;
    }> | null>(null);

    let selectedCategoryId = $state<number | null>(null);

    onMount(async () => {
        const res = await fetch('/api/categories');
        if (res.ok) {
            categories = await res.json();

            if (categories && categories.length > 0) {
                selectedCategoryId = categories[0].id;
                await loadThreads(selectedCategoryId);
            }
        }
    });

    async function loadThreads(categoryId: number) {
        threads = null; // ローディング表示のため一旦クリア
		const res = await fetch(`/api/categories/${categoryId}/threads`);
		if (res.ok) {
			threads = await res.json();
		}
    }

    function selectCategory(id: number) {
		selectedCategoryId = id;
		loadThreads(id);
	}
</script>

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

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
