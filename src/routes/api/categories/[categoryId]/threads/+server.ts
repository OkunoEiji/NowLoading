import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';

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