<script lang="ts">
	import { onMount } from "svelte";

    let categories = $state<Array<{
        id: number;
        name: string;
        description: string | null;
        threadCount: number;
    }> | null>(null);

    onMount(async () => {
        const res = await fetch('/api/categories');
        if (res.ok) {
            categories = await res.json();
        }
    });
</script>

{#if categories}
	<ul>
		{#each categories as c}
			<li>{c.name} ({c.threadCount} スレッド)</li>
		{/each}
	</ul>
{:else}
	<p>読み込み中...</p>
{/if}

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
