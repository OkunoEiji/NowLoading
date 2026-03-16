import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { authorize } from '$lib/server/auth/permissions';
import { getDbUserWithRoles } from '$lib/server/auth/get-db-user';

export const PATCH: RequestHandler = async ({ params, locals }) => {
    const threadId = Number(params.threadId);
    const messageId = Number(params.messageId);

    if (!Number.isInteger(threadId) || threadId <= 0
    || !Number.isInteger(messageId) || messageId <= 0) throw error(400, '無効なパラメータです。');

    const auth = locals.auth?.();
    const dbUser = await getDbUserWithRoles(auth?.userId);

    if (!dbUser) throw error(401, 'ログインしてください。');

    // 権限チェック（削除権限あるユーザーが復元）
    authorize(dbUser as any, 'DELETE_MESSAGE');

    const message = await prisma.message.findUnique({
        where: { id: messageId, threadId },
        select: {
            id: true,
            authorId: true,
            deletedAt: true
        }
    });

    if (!message) throw error(404, 'メッセージが見つかりません。');

    if (!message.deletedAt) throw error(400, 'このメッセージは既に復元されています。');

    if (message.authorId !== dbUser.id) throw error(403, '他人のメッセージは復元できません。');

    await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: null }
    });

    return json({ ok: true, message: 'メッセージを復元しました' });
};