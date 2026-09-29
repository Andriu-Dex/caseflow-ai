
const fs = require("fs");
const path = require("path");

const p = path.join(__dirname, "apps/api/test/integration/support/test-app.ts");
let content = fs.readFileSync(p, "utf8");

const importToken = `import { JwtService } from "@nestjs/jwt";\nimport { IdentityModule } from "../../../src/identity/identity.module";\n`;

content = importToken + content;

content = content.replace("ReadinessModule,", "ReadinessModule,\n      IdentityModule,");

const setupBlock = `
  const app = moduleRef.createNestApplication();
  
  const prisma = app.get(PrismaService);
  const jwtService = app.get(JwtService);
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "test@example.com",
        passwordHash: "dummy",
        displayName: "Test User"
      }
    });
  }
  const token = jwtService.sign({ sub: user.id });

  const originalWorkspaceCreate = prisma.workspace.create;
  prisma.workspace.create = async (args) => {
    const w = await originalWorkspaceCreate.call(prisma, args);
    const currentUser = await prisma.user.findFirst();
    if (currentUser) {
      await prisma.workspaceMembership.create({
        data: { workspaceId: w.id, userId: currentUser.id, role: "OWNER" }
      });
    }
    return w;
  };
  
  const originalProjectCreate = prisma.project.create;
  prisma.project.create = async (args) => {
    const p = await originalProjectCreate.call(prisma, args);
    const currentUser = await prisma.user.findFirst();
    if (currentUser) {
      await prisma.projectMembership.create({
        data: { projectId: p.id, userId: currentUser.id, role: "OWNER" }
      });
    }
    return p;
  };

  app.use((req, res, next) => {
    if (!req.headers.authorization) {
      req.headers.authorization = "Bearer " + token;
    }
    next();
  });

  await app.init();
`;

content = content.replace("  const app = moduleRef.createNestApplication();\n  await app.init();", setupBlock);

fs.writeFileSync(p, content);
console.log("Updated test-app.ts");

