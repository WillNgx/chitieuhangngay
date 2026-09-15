import { PrismaClient } from '@prisma/client';
import { logger } from '../../shared/logger/index.js';

export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'event', level: 'info' },
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
  ],
});

prisma.$on('warn', (e) => {
  logger.warn({ prismaEvent: e }, 'Prisma warning');
});

prisma.$on('error', (e) => {
  logger.error({ prismaEvent: e }, 'Prisma error');
});
