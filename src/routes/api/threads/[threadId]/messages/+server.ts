import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { authorize } from '$lib/server/auth/permissions';
import { getDbUserWithRoles } from '$lib/server/auth/get-db-user';

export const GET: RequestHandler = async ({ params, url }) => {
    const threadId = Number(params.threadId);

    if (!Number.isInteger(threadId) || threadId <= 0) throw error(400, '無効なスレッドIDです。');

    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

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
            ...(includeDeleted ? {} : { deletedAt: null })
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
            deletedAt: true,
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
        deletedAt: message.deletedAt
    }));

    return json(payload);
}

export const POST: RequestHandler = async ({ params, locals, request }) => {
    const threadId = Number(params.threadId);

    if (!Number.isInteger(threadId) || threadId <= 0) throw error(400, '無効なスレッドIDです。');

    const auth = locals.auth?.();
    const dbUser = await getDbUserWithRoles(auth?.userId);

    if (!dbUser) throw error(401, 'ログインしてください。');

    // 権限チェック
    authorize(dbUser as any, 'POST_MESSAGE');

    // スレッドが存在するか確認
    const thread = await prisma.thread.findUnique({
        where: { id: threadId },
        select: { id: true }
    });

    if (!thread) throw error(404, 'スレッドが見つかりません。');

    // リクエストボディをパース
    const body = await request.json().catch(() => null) as { content?: string } | null;
    const content = body?.content?.trim() ?? '';

    if (!content) throw error(400, '内容を入力してください。');

    const created = await prisma.message.create({
        data: {
            threadId,
            authorId: dbUser.id,
            content
        },
        select: {
            id: true,
            threadId: true,
            authorId: true,
            content: true,
            updatedAt: true,
            deletedAt: true,
            author: {
                select: { username: true }
            }
        }
    });

    return json({
        id: created.id,
        threadId: created.threadId,
        authorId: created.authorId,
        authorUserName: created.author?.username ?? null,
        content: created.content,
        updatedAt: created.updatedAt,
        deletedAt: created.deletedAt
    });
};