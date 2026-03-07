import { buildClerkProps, clerkClient } from 'svelte-clerk/server';
import type { LayoutServerLoad } from './$types';
import { syncUserFromClerk } from '$lib/server/auth/user-sync';

export const load: LayoutServerLoad = async ({ locals }) => {
	const authFn = locals.auth;

	// Clerkミドルウェアが動いていない場合の保険
	if (!authFn) {
		return {};
	}

	const auth = authFn();
	console.log('Clerk auth in +layout.server.ts', auth);

	// 未ログイン(Guest)の場合、同期せずそのまま返す
	if (!auth || !auth.userId) {
		return {
			...buildClerkProps(auth)
		};
	}

	// Clerk からユーザー詳細を取得し、Prisma の User / UserRole と同期（初回なら作成）
	const clerkUser = await clerkClient.users.getUser(auth.userId);
	const dbUser = await syncUserFromClerk(clerkUser);
	console.log('synced DB user from Clerk', { clerkUserId: clerkUser.id, dbUserId: dbUser.id });

	return {
		...buildClerkProps(auth),
		dbUser
	};
};