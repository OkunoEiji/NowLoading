import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { authorize } from '$lib/server/auth/permissions';

// カテゴリに紐づくスレッド一覧を取得
export const GET: RequestHandler = async ({ params }) => {
    const categoryId = Number(params.categoryId);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        throw error(400, '無効なカテゴリIDです。');
    }

    // カテゴリが存在するか確認
    const category = await prisma.category.findMany({
        where: { id: categoryId },
        select: { id: true }
    });

    if (!category) {
        throw error(404, 'カテゴリが見つかりません。');
    }

    const threads = await prisma.thread.findMany({
        where: { categoryId },
        orderBy: { id: 'asc' },
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            messages: {
                select: { id: true }
            }
        }
    });

    const payload = threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
        messageCount: thread.messages.length
    }));

    return json(payload);
};

export const POST: RequestHandler = async (event) => {
    const categoryId = Number(event.params.categoryId);
    
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
        throw error(400, '無効なカテゴリIDです。');
    }

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

    // 権限チェック（ADMIN/SUB_ADMIN/USERのみ）
    authorize(dbUser as any, 'CREATE_THREAD');

    // カテゴリが存在するか確認
    const category = await prisma.category.findUnique({
        where: { id: categoryId },
        select: { id: true }
    });

    if (!category) {
        throw error(404, 'カテゴリが見つかりません。');
    }

    const body = await event.request.json().catch(() => null) as {
        title?: string;
    } | null;

    const title = body?.title?.trim() ?? '';

    if (!title) {
        throw error(400, 'スレッドタイトルを入力してください。');
    }

    const thread = await prisma.thread.create({
        data: {
            title,
            categoryId,
            createdById: dbUser.id,
        },
        select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
        }
    });

    // レスポンス
    return json(thread, { status: 201 });
};