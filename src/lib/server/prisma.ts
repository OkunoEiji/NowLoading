import type * as PrismaClientModule from '../../../generated/prisma';
import { createRequire } from 'module';
import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL } from '$env/static/private';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('../../../generated/prisma') as typeof PrismaClientModule;

const globalForPrisma = globalThis as unknown as {
	prisma?: PrismaClientModule.PrismaClient;
};

function createPrismaClient() {
	const connectionString = DATABASE_URL;

	const adapter = new PrismaPg({ connectionString });

	return new PrismaClient({
		adapter,
		log: ['error', 'warn']
	});
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
	globalForPrisma.prisma = prisma;
}

