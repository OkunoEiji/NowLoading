type ClerkUser = {
	id: string;
	emailAddresses: { emailAddress: string }[];
	username: string | null;
};

import { prisma } from '$lib/server/prisma';

const DEFAULT_ROLE_NAME = 'USER';

export async function syncUserFromClerk(clerkUser: ClerkUser) {
    const clerkId = clerkUser.id;
	const email = clerkUser.emailAddresses[0]?.emailAddress ?? '';
	const username = clerkUser.username ?? clerkUser.id;

    // 既存ユーザーをclerkIdで取得
    let user = await prisma.user.findUnique({
        where: { clerkId },
        include: {
            userRoles: {
                include: { role: true }
            }
        }
    });

    // ユーザーが存在しない場合は新規作成
    if (!user) {
        // デフォルトロール USER を取得
        let role = await prisma.role.findUnique({
            where: { name: DEFAULT_ROLE_NAME },
        });

        if (!role) {
            role = await prisma.role.create({
                data: { name: DEFAULT_ROLE_NAME }
            });
        }

        user = await prisma.user.create({
            data: {
                clerkId,
                email,
                username,
                postalCode: '',
                prefectureCity: '',
                birthDate: new Date('2000-01-01'),
                userRoles: {
                    create: {
                        roleId: role.id
                    }
                }
            },
            include: {
                userRoles: {
                    include: { role: true }
                }
            }
        });
    }
    return user;
}