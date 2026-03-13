import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { authorize } from '$lib/server/auth/permissions';

// カテゴリ一覧を取得
export const GET: RequestHandler = async () => {
    const categories = await prisma.category.findMany({
        orderBy: { id: 'asc' },
        select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
            threads: {
                select: { id: true},
            }
        }
    });

    const payload = categories.map((category) => ({
        id: category.id,
        name: category.name,
        description: category.description,
        createdAt: category.createdAt,
        updatedAt: category.updatedAt,
        threadCount: category.threads.length,
    }));

    return json(payload);
};

// カテゴリを作成
export const POST: RequestHandler = async (event) => {
    // 認証情報
    const auth = event.locals.auth?.();
    const userId = auth?.userId;

    if (!userId) {
        throw error(401, 'ログインが必要です。');
    }

    // DBからユーザーを取得
    const dbUser = await prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
            userRoles: {
                include: { role: true }
            }
        }
    });

    if (!dbUser) {
        throw error(404, 'ユーザーを取得できません。');
    }

    // 権限チェック（ADMIN/SUB_ADMINのみ）
    authorize(dbUser as any, 'CREATE_CATEGORY');

    // リクエストボディを取得
    const body = await event.request.json().catch(() => null) as {
        name?: string;
        description?: string | null;
    } | null;

    const name = body?.name?.trim() ?? '';
    const description = body?.description?.trim() || null;

    if (!name) {
		throw error(400, 'カテゴリ名を入力してください。');
	}

    // カテゴリを作成
    const category = await prisma.category.create({
        data: {
            name,
            description,
            createdById: dbUser.id,
        },
        select: {
            id: true,
            name: true,
            description: true,
            createdAt: true,
            updatedAt: true,
        }
    });

    // レスポンス
	return json(category, { status: 201 });
};