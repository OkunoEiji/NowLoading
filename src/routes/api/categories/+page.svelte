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

    let newCategoryName = $state<string>('');
    let newCategoryDescription = $state<string>('');
    
    async function loadCategories() {
        const res = await fetch('/api/categories');
        if (res.ok) {
            categories = await res.json();
        }
    }

    onMount(loadCategories);

    async function createCategory() {
        if (!newCategoryName.trim()) {
            alert('カテゴリ名を入力してください。');
            return;
        }

        const res = await fetch('/api/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: newCategoryName,
                description: newCategoryDescription
            })
        });

        if (!res.ok) {
            const text = await res.text();
            alert(`カテゴリ作成に失敗しました: ${text}`);
            return;
        }

        // 成功したらフォームクリアし、一覧を再評価
        newCategoryName = '';
        newCategoryDescription = '';
        await loadCategories();
    }
</script>

<div class="space-y-2">
	<h2>カテゴリ作成（ADMIN / SUB_ADMINのみ）</h2>
	<input
		type="text"
		placeholder="カテゴリ名"
		bind:value={newCategoryName}
	/>
	<input
		type="text"
		placeholder="説明（任意）"
		bind:value={newCategoryDescription}
	/>
	<button type="button" onclick={createCategory}>
		カテゴリを作成
	</button>
</div>