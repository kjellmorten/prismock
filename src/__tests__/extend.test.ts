import { User, Blog, PrismaClient } from '@prisma/client';

import { resetDb, simulateSeed } from '../../testing';
import { PrismockClient, PrismockClientType } from '../lib/client';
import { fetchGenerator } from '../lib/prismock';

jest.setTimeout(40000);

const extension: Parameters<PrismaClient['$extends']>[0] = {
  name: 'testExtension',
  query: {
    user: {
      async $allOperations({ model, operation, args, query }) {
        const user = await query(args);
        if (typeof user === 'object') {
          return { ...user, email: `${model}@${operation}.com` }; // A bit weird, but serves to validate our extension
        } else {
          return user;
        }
      },
    },
    blog: {
      async findFirst({ model: _model, operation, args, query }) {
        const blog = await query(args);
        return { ...blog, title: `Blog: ${operation}` }; // A bit weird, but serves to validate our extension
      },
    },
  },
};

const extendPrisma = (prisma: PrismaClient) => prisma.$extends(extension);

describe('extend', () => {
  let prismock: PrismockClientType;
  let prisma: PrismaClient;
  let prismockExt: ReturnType<typeof extendPrisma>;
  let prismaExt: ReturnType<typeof extendPrisma>;

  beforeAll(async () => {
    await resetDb();

    prisma = new PrismaClient();
    prismock = new PrismockClient() as PrismockClientType;
    await simulateSeed(prismock);

    prismaExt = extendPrisma(prisma);
    prismockExt = extendPrisma(prismock);

    const generator = await fetchGenerator();
    generator.stop();
  });

  it('Should support model $allOperations extension', async () => {
    const realUser = (await prisma.user.findFirst({
      where: { email: 'user2@company.com' },
    })) as User;
    const realExtUser = (await (prismaExt as unknown as PrismaClient).user.findFirst({
      where: { email: 'user2@company.com' },
    })) as User;

    const mockUser = (await prismock.user.findFirst({
      where: { email: 'user2@company.com' },
    })) as User;
    const mockExtUser = (await (prismockExt as unknown as PrismockClientType).user.findFirst({
      where: { email: 'user2@company.com' },
    })) as User;

    expect(realUser.email).toEqual('user2@company.com');
    expect(realExtUser.email).toEqual('User@findFirst.com');
    expect(mockUser.email).toEqual('user2@company.com');
    expect(mockExtUser.email).toEqual('User@findFirst.com');
  });

  it('Should support model operations extension', async () => {
    const realUser = (await prisma.blog.findFirst({
      where: { id: 1 },
    })) as Blog;
    const realExtUser = (await (prismaExt as unknown as PrismaClient).blog.findFirst({
      where: { id: 1 },
    })) as Blog;

    const mockUser = (await prismock.blog.findFirst({
      where: { id: 1 },
    })) as Blog;
    const mockExtUser = (await (prismockExt as unknown as PrismockClientType).blog.findFirst({
      where: { id: 1 },
    })) as Blog;

    expect(realUser.title).toEqual('blog-1');
    expect(realExtUser.title).toEqual('Blog: findFirst');
    expect(mockUser.title).toEqual('blog-1');
    expect(mockExtUser.title).toEqual('Blog: findFirst');
  });

  it('Should not extend query not found in extension', async () => {
    const realUser = (await prisma.blog.findUnique({
      where: { id: 1 },
    })) as Blog;
    const realExtUser = (await (prismaExt as unknown as PrismaClient).blog.findUnique({
      where: { id: 1 },
    })) as Blog;

    const mockUser = (await prismock.blog.findUnique({
      where: { id: 1 },
    })) as Blog;
    const mockExtUser = (await (prismockExt as unknown as PrismockClientType).blog.findUnique({
      where: { id: 1 },
    })) as Blog;

    expect(realUser.title).toEqual('blog-1');
    expect(realExtUser.title).toEqual('blog-1'); // Not extended
    expect(mockUser.title).toEqual('blog-1');
    expect(mockExtUser.title).toEqual('blog-1'); // Not extended
  });
});
