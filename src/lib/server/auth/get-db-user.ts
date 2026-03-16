import { prisma } from '$lib/server/prisma';

export async function getDbUserWithRoles(userId: string | null | undefined) {
    if (!userId) return null;

    return prisma.user.findUnique({
        where: { clerkId: userId },
        include: {
            userRoles: {
                include: {
                    role: true
                }
            }
        }
    });
}