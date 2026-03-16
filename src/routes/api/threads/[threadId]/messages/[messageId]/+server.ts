import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { prisma } from '$lib/server/prisma';
import { authorize } from '$lib/server/auth/permissions';
import { getDbUserWithRoles } from '$lib/server/auth/get-db-user';

export const DELETE: RequestHandler = async ({ params, locals }) => {
    const threadId = Number(params.threadId);
    const messageId = Number(params.messageId);

    if (!Number.isInteger(threadId) || threadId <= 0
        || !Number.isInteger(messageId) || messageId <= 0) {
		throw error(400, '無効なパラメータです。');
	}

    const auth = locals.auth?.();
    const dbUser = await getDbUserWithRoles(auth?.userId);

    if (!dbUser) {
        throw error(401, 'ログインしてください。');
    }

    // 権限チェック
    authorize(dbUser as any, 'DELETE_MESSAGE');

    // 対象メッセージを取得（authorId も取得し,「自分の投稿か」を判定）
    const message = await prisma.message.findUnique({
        where: { id: messageId, threadId },
        select: {
            id: true,
            authorId: true,
            deletedAt: true
        }
    });

    if (!message) {
		throw error(404, 'メッセージが見つかりません。');
	}

    if (message.deletedAt) {
		throw error(410, 'このメッセージは既に削除されています。');
	}

	if (message.authorId !== dbUser.id) {
		throw error(403, '他人のメッセージは削除できません。');
	}
    
    await prisma.message.update({
        where: { id: messageId },
        data: {
            deletedAt: new Date()
        }
    });

    return json({ ok: true, message: 'メッセージを削除しました' });
};

export const PATCH: RequestHandler = async ({ params, locals, request }) => {
    const threadId = Number(params.threadId);
    const messageId = Number(params.messageId);

    if (!Number.isInteger(threadId) || threadId <= 0
        || !Number.isInteger(messageId) || messageId <= 0)
    {
        throw error(400, '無効なパラメータです。');
    }

    const auth = locals.auth?.();
    const dbUser = await getDbUserWithRoles(auth?.userId);

    if (!dbUser) {
        throw error(401, 'ログインしてください。');
    }

    // 権限チェック
    authorize(dbUser as any, 'EDIT_MESSAGE');

    const message = await prisma.message.findUnique({
        where: { id: messageId, threadId },
        select: {
            id: true,
            authorId: true,
            deletedAt: true
        }
    });

    if (!message) {
		throw error(404, 'メッセージが見つかりません。');
	}

	if (message.deletedAt) {
		throw error(410, '削除済みのメッセージは編集できません。');
	}

    if (message.authorId !== dbUser.id) {
		throw error(403, '他人のメッセージは編集できません。');
	}

    // リクエストボディをパース
    const body = await request.json().catch(() => null) as { content?: string } | null;
	const content = body?.content?.trim() ?? '';

    if (!content) {
        throw error(400, '内容を入力してください。');
    }

    const updated = await prisma.message.update({
        where: { id: messageId },
        data: { content },
        select: {
            id: true,
            threadId: true,
            authorId: true,
            content: true,
            createdAt: true,
            updatedAt: true
        }
    });

    return json(updated);
};