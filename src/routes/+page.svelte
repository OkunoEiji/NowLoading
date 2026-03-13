<script lang="ts">
    import { onMount } from "svelte";

    let { params }: { params: { threadId: string } } = $props();

    let messages = $state<
        Array<{
            id: number;
            content: string;
            authorUserName: string;
            createdAt: string;
        }> | null
    >(null);

    let errorMessage = $state<string | null>(null);

    onMount(async () => {
        try {
            const res = await fetch(`/api/threads/1/messages`);
            if (!res.ok) {
                errorMessage = `取得に失敗しました: ${res.status}`;
                return;
            }

            const data = await res.json();
            messages = data.map((message: any) => ({
                id: message.id,
                content: message.content,
                authorUserName: message.authorUserName,
                createdAt: message.createdAt,
            }));
        } catch (err) {
            errorMessage = `エラーが発生しました: ${err}`;
        }
    })
</script>

<h1>スレッド {params.threadId} のメッセージ一覧</h1>
{#if errorMessage}
	<p style="color:red;">{errorMessage}</p>
{:else if messages === null}
	<p>読み込み中...</p>
{:else if messages.length === 0}
	<p>メッセージはまだありません。</p>
{:else}
	<ul>
		{#each messages as message}
			<li>
				<div>
					<strong>{message.authorUserName ?? '匿名'}</strong>
					<small>（ID: {message.id} / {message.createdAt}）</small>
				</div>
				<div>{message.content}</div>
			</li>
		{/each}
	</ul>
{/if}

<h1>Welcome to SvelteKit</h1>
<p>Visit <a href="https://svelte.dev/docs/kit">svelte.dev/docs/kit</a> to read the documentation</p>
