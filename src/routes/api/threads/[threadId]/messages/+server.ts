import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';

export const GET: RequestHandler = async ({ params, url }) => {
    const threadId = Number(params.threadId);

    if (!Number.isInteger(threadId) || threadId <= 0) {
        throw error(400, '無効なスレッドIDです。');
    }

    // スレッドが存在するか確認
    const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { id: true }
    });

    if (!thread) {
        throw error(404, 'スレッドが見つかりません。');
    }

    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    const afterParam = url.searchParams.get('after');
    const afterId = afterParam ? Number(afterParam) : undefined;

    const messages = await prisma.message.findMany({
        where: { 
            threadId,
            deletedAt: null
        },
        orderBy: { id: 'asc' },
        take: limit,
        ...(afterId ? { cursor: { id: afterId }, skip: 1 } : {}),
        select: {
            id: true,
            threadId: true,
            authorId: true,
            content: true,
            updatedAt: true,
            author: {
                select: { username: true }
            }
        }
    });

    const payload = messages.map((message) => ({
        id: message.id,
        threadId: message.threadId,
        authorId: message.authorId,
        authorUserName: message.author?.username,
        content: message.content,
        updatedAt: message.updatedAt,
    }));

    return json(payload);
}