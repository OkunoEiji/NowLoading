import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async (event) => {
    // 親レイアウトの戻り値を取得
    const auth = event.locals.auth?.();
    const userId = auth?.userId;

    // 未ログインの場合、そのまま表示（Guestとして閲覧）
    if (!userId) {
        return {};
    }

    // Clerk IDからDBユーザーを取得
    const dbUser = await prisma.user.findUnique({
        where: { clerkId: userId }
    });

    // 住所未設定なら初期設定ページへリダイレクト
    if (!dbUser?.postalCode || !dbUser?.prefectureCity) {
		throw redirect(302, '/settings/profile');
	}

    // それ以外は通常のトップページデータを返す
	return {
        user: {
            id: dbUser?.id,
            clerkId: dbUser?.clerkId,
            email: dbUser?.email,
            username: dbUser?.username,
            birthDate: dbUser?.birthDate,
            postalCode: dbUser?.postalCode,
			prefectureCity: dbUser?.prefectureCity
        }
    }
};