import 'dotenv/config';
import { createRequire } from 'module';
import { PrismaPg } from '@prisma/adapter-pg';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../generated/prisma');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
	throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
    /// データ削除
    await prisma.message.deleteMany();
    await prisma.thread.deleteMany();
    await prisma.category.deleteMany();
    await prisma.userRole.deleteMany();
	await prisma.role.deleteMany();
	await prisma.user.deleteMany();
    
    const adminRole = await prisma.role.create({
        data: { name: 'ADMIN' }
    });
    const subAdminRole = await prisma.role.create({
        data: { name: 'SUB_ADMIN' }
    });
    const userRole = await prisma.role.create({
        data: { name: 'USER' }
    });

    const admin = await prisma.user.create({
        data: {
            clerkId: 'user_3AcB9xM4qELR1RwjVSsNAoc2Uzp',
            email: 'e.okuno@nextmake.co.jp',
            postalCode: '5460021',
            prefectureCity: '大阪府大阪市東住吉区照ケ丘矢田',
            birthDate: new Date('1996-09-29'),
            username: '管理者ユーザー'
        }
    });

    const user1 = await prisma.user.create({
        data: {
            clerkId: 'user_2Q3fJ5g0a4mJl8n0',
            email: 'user1@example.com',
            postalCode: '1000000',
            prefectureCity: '東京都千代田区永田町',
            birthDate: new Date('1990-01-01'),
            username: 'ユーザー1',
        }
    });

    /// ユーザーとロールの紐づけ
    await prisma.userRole.createMany({
        data: [
            { userId: admin.id, roleId: adminRole.id },
            { userId: user1.id, roleId: userRole.id }
        ]
    });

    /// カテゴリ作成
    const category1 = await prisma.category.create({
		data: {
			name: 'Svelte / SvelteKit',
			description: 'Svelte / SvelteKit に関する技術共有',
			createdById: admin.id
		}
	});

	const category2 = await prisma.category.create({
		data: {
			name: 'データベース設計',
			description: 'Prisma / PostgreSQL / マイグレーション など',
			createdById: user1.id
		}
	});

    /// スレッド作成
	const thread1 = await prisma.thread.create({
		data: {
			title: 'SvelteKit でリアルタイムチャットを作るには？',
			categoryId: category1.id,
			createdById: admin.id
		}
	});

	const thread2 = await prisma.thread.create({
		data: {
			title: 'Prisma 7 の adapter 設計について',
			categoryId: category1.id,
			createdById: admin.id
		}
	});

    /// メッセージ作成
	await prisma.message.createMany({
		data: [
			{
				threadId: thread1.id,
				authorId: user1.id,
				content: 'SvelteKit + ws での実装例を共有します。'
			},
			{
				threadId: thread1.id,
				authorId: admin.id,
				content: 'WebSocket サーバーはどこに立てる想定ですか？'
			},
			{
				threadId: thread2.id,
				authorId: user1.id,
				content: 'Prisma 7 から adapter 必須になりましたね。'
			}
		]
	});

    console.log('データ作成が完了しました。');
}

main()
	.catch((e) => {
		console.error(e);
		process.exit(1);
	})
	.finally(async () => {
		await prisma.$disconnect();
	});