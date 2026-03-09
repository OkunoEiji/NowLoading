<script lang="ts">
    import type { PageData } from './$types';
	import { User, Save } from 'lucide-svelte';

	type ExtendedPageData = PageData & {
		message?: string;
	};
    let { data }: { data: ExtendedPageData } = $props();

	const user = data.user;
	const errorMessage = $derived(data.message);

	let birthYear = $state(
		user.birthDate ? new Date(user.birthDate).getFullYear() : 2000
	);
	let birthMonth = $state(
		user.birthDate ? new Date(user.birthDate).getMonth() + 1 : 1
	);
	let birthDay = $state(
		user.birthDate ? new Date(user.birthDate).getDate() : 1
	);

	let username = $state(user.username ?? '');
	let email = $derived(user.email);
	let postalCode = $state(user.postalCode ?? '');
	let prefectureCity = $state(user.prefectureCity ?? '');

	let zipError = $state<string | null>(null);

	// 郵便番号から住所を取得
	async function fetchAddressFromZip() {
		zipError = null;
		const zip = postalCode.replace(/[^\d]/g, '');

		if (zip.length < 7) {
			zipError = '7桁の郵便番号を入力してください。';
			return;
		}

		const res = await fetch(
			`https://api.zipaddress.net/?zipcode=${encodeURIComponent(zip)}`
		);

		const json = await res.json();

		if (json.code !== 200 || !json.data) {
			zipError = '住所が見つかりませんでした。郵便番号を確認してください。';
			return;
		}

		prefectureCity = `${json.data.pref}${json.data.city}${json.data.town ?? ''}`;
	}
</script>

<main class="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-purple-50 text-gray-900">
	<section class="max-w-3xl mx-auto px-6 py-8 pb-24">
		<!-- プロフィール設定カード -->
		<form method="POST" class="bg-white rounded-2xl p-8 border border-gray-200 shadow-lg space-y-8">
			<div class="flex items-center gap-3 mb-2">
				<div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
					<User class="w-5 h-5" />
				</div>
				<h2 class="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">プロフィール設定</h2>
			</div>
			{#if errorMessage}
				<p class="text-sm text-red-500 mt-1">{errorMessage}</p>
			{/if}
			<div class="space-y-6">
				<!-- ユーザー名 -->
				<div>
					<label for="username" class="block text-sm font-medium mb-2">ユーザー名</label>
					<input id="username" name="username" type="text" bind:value={username} class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="例：ユーザー名" required />
				</div>
				<!-- メールアドレス -->
				<div>
					<label for="email" class="block text-sm font-medium mb-2">メールアドレス</label>
					<input id="email" type="email" bind:value={email} disabled class="w-full px-4 py-3 rounded-xl bg-gray-100 border-gray-200 text-gray-500 cursor-not-allowed">
				</div>
				<!-- 生年月日 -->
				<div>
					<p class="block text-sm font-medium mb-2">生年月日</p>
					<div class="flex gap-3">
						<div class="flex-1">
							<label for="birthYear" class="sr-only">年</label>
							<input id="birthYear" name="birthYear" type="number" bind:value={birthYear} class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="1990" required />
						</div>
						<div class="flex-1">
							<label for="birthMonth" class="sr-only">月</label>
							<input id="birthMonth" name="birthMonth" type="number" bind:value={birthMonth} class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="1" min="1" max="12" required />
						</div>
						<div class="flex-1">
							<label for="birthDay" class="sr-only">日</label>
							<input id="birthDay" name="birthDay" type="number" bind:value={birthDay} class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="1" min="1" max="31" required />
						</div>
					</div>
				</div>
				<!-- 郵便番号 -->
				<div>
					<label for="postalCode" class="block text-sm font-medium mb-2">郵便番号</label>
					<div class="flex gap-2 items-start">
						<div class="relative flex-1">
							<span class="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium text-sm">〒</span>
							<input id="postalCode" name="postalCode" type="text" bind:value={postalCode} class="w-full pl-9 pr-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="0000000" maxlength="7" inputmode="numeric" required />
						</div>
						<button type="button" on:click={fetchAddressFromZip} class="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-medium hover:bg-blue-100 transition-colors">住所検索</button>
					</div>
					{#if zipError}
						<p class="text-sm text-red-500 mt-1">{zipError}</p>
					{/if}
				</div>
				<!-- 住所 -->
				<div>
					<label for="prefectureCity" class="block text-sm font-medium mb-2">住所</label>
					<input
						id="prefectureCity"
						name="prefectureCity"
						type="text"
						bind:value={prefectureCity}
						class="w-full px-4 py-3 rounded-xl bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
						placeholder="都道府県・市区町村"
					/>
				</div>
			</div>
			<!-- 保存ボタン -->
			<div class="flex justify-end pt-6">
				<button type="submit" class="px-6 py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl shadow-lg hover:shadow-blue-500/30 hover:scale-105 transition-all duration-200 flex items-center gap-2 font-semibold text-sm">
					<Save class="w-5 h-5" />
					保存
				</button>
			</div>
		</form>
	</section>
</main>
