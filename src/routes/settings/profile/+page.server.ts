import type { PageServerLoad, Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';

export const load: PageServerLoad = async (event) => {
    const auth = event.locals.auth?.();
    const userId = auth?.userId;

    // 未ログインの場合、サインインページへリダイレクト
    if (!userId) {
        throw redirect(302, '/sign-in');
    }

    // Clerk IDからDBユーザーを取得
    const dbUser = await prisma.user.findUnique({
        where: { clerkId: userId }
    });

    if (!dbUser) {
		throw redirect(302, '/');
	}

    const birth = dbUser.birthDate ?? new Date('2000-01-01');

    return {
        user: {
            id: dbUser.id,
            clerkId: dbUser.clerkId,
            email: dbUser.email,
            username: dbUser.username,
            birthDate: dbUser.birthDate,
            postalCode: dbUser.postalCode,
			prefectureCity: dbUser.prefectureCity,
            birthYear: birth.getFullYear(),
			birthMonth: birth.getMonth() + 1,
			birthDay: birth.getDate()
        }
    }
};

export const actions: Actions = {
	default: async (event) => {
		const auth = event.locals.auth?.();
		const userId = auth?.userId;
		if (!userId) {
			throw redirect(302, '/sign-in');
		}
		const formData = await event.request.formData();
		const username = String(formData.get('username') ?? '').trim();
		const postalCode = String(formData.get('postalCode') ?? '').trim();
		const prefectureCity = String(formData.get('prefectureCity') ?? '').trim();
		const birthYear = Number(formData.get('birthYear'));
		const birthMonth = Number(formData.get('birthMonth'));
		const birthDay = Number(formData.get('birthDay'));

		// バリデーション
		if (!username || !postalCode || !prefectureCity) {
			return fail(400, {
				message: 'ユーザー名・郵便番号・住所は必須です。',
				user: {
					username,
					postalCode,
					prefectureCity,
					birthYear,
					birthMonth,
					birthDay
				}
			});
		}

		// 生年月日をbirthDateで組み立て更新
		const birthDate = new Date(birthYear, birthMonth - 1, birthDay);
		await prisma.user.update({
			where: { clerkId: userId },
			data: {
				username,
				postalCode,
				prefectureCity,
				birthDate
			}
		});

		// 保存後はトップに戻す
		throw redirect(302, '/');
	}
};