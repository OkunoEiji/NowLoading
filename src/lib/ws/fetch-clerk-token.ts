/**
 * WebSocket 用 JWT を Clerk から取得する。
 * セッション確立直後は getToken が null になり得るため、指数バックオフで再試行する。
 *
 * 注意: `Clerk.load()` を接続のたびに呼ぶと、既に初期化済みのインスタンスで不具合になることがあるため、
 * 未ロードのときだけ 1 回だけ実行する。
 */
const MAX_ATTEMPTS = 12;
const BASE_DELAY_MS = 80;

let clerkLoadOnce: Promise<void> | null = null;

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureClerkLoadedOnce(clerk: ClerkLike): Promise<void> {
	const loaded = (clerk as { loaded?: boolean }).loaded;
	if (loaded === true) return Promise.resolve();
	if (typeof clerk.load !== 'function') return Promise.resolve();

	if (!clerkLoadOnce) {
		clerkLoadOnce = clerk
			.load()
			.then(() => undefined)
			.catch(() => undefined);
	}
	return clerkLoadOnce;
}

export async function fetchClerkSessionTokenForWs(): Promise<string | null> {
	if (typeof globalThis === 'undefined') return null;

	const clerk = (globalThis as { Clerk?: ClerkLike }).Clerk;
	if (!clerk) return null;

	await ensureClerkLoadedOnce(clerk);

	for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
		const token = await clerk.session?.getToken?.();
		if (token) return token;

		if (attempt < MAX_ATTEMPTS - 1) {
			const delay = Math.round(BASE_DELAY_MS * Math.pow(1.65, attempt));
			await sleep(Math.min(delay, 2500));
		}
	}

	return null;
}

type ClerkLike = {
	load?: () => Promise<unknown>;
	session?: { getToken?: () => Promise<string | null> };
};
