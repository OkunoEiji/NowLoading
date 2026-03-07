/// <reference types="svelte-clerk/env" />

declare global {
	namespace App {
		interface Platform {
			env: unknown;
			ctx: unknown;
			caches: CacheStorage;
			cf?: unknown;
		}
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
	}
}

export {};