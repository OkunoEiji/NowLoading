import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';

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