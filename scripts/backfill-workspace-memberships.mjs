import pkg from '../apps/api/src/generated/prisma/index.js';
const { PrismaClient } = pkg;

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  if (users.length === 0) {
    console.log('No users found. Creating a default user...');
    const defaultUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: 'dummy',
        displayName: 'Admin User'
      }
    });
    users.push(defaultUser);
  }

  const ownerId = users[0].id;
  
  const workspaces = await prisma.workspace.findMany();
  for (const workspace of workspaces) {
    await prisma.workspaceMembership.upsert({
      where: {
        workspaceId_userId: {
          workspaceId: workspace.id,
          userId: ownerId,
        }
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        userId: ownerId,
        role: 'OWNER'
      }
    });
  }

  const projects = await prisma.project.findMany();
  for (const project of projects) {
    await prisma.projectMembership.upsert({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: ownerId,
        }
      },
      update: {},
      create: {
        projectId: project.id,
        userId: ownerId,
        role: 'OWNER'
      }
    });
  }

  console.log('Successfully backfilled workspace and project memberships.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
