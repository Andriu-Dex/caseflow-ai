
const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "apps/api/src");
const controllers = [];

function findControllers(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findControllers(fullPath);
    } else if (file.endsWith(".controller.ts")) {
      controllers.push(fullPath);
    }
  }
}

findControllers(srcDir);

for (const file of controllers) {
  if (file.includes("health.controller.ts") || file.includes("auth.controller.ts")) {
    continue;
  }

  let content = fs.readFileSync(file, "utf8");
  let guardsToAdd = ["JwtAuthGuard"];
  
  if (content.includes("projectId")) guardsToAdd.push("ProjectMembershipGuard");
  if (content.includes("workspaceId")) guardsToAdd.push("WorkspaceMembershipGuard");
  
  guardsToAdd = [...new Set(guardsToAdd)];

  let imports = "import { UseGuards } from \"@nestjs/common\";\n";
  if (guardsToAdd.includes("JwtAuthGuard")) imports += "import { JwtAuthGuard } from \"../identity/jwt-auth.guard\";\n";
  if (guardsToAdd.includes("ProjectMembershipGuard")) imports += "import { ProjectMembershipGuard } from \"../identity/project-membership.guard\";\n";
  if (guardsToAdd.includes("WorkspaceMembershipGuard")) imports += "import { WorkspaceMembershipGuard } from \"../identity/workspace-membership.guard\";\n";

  if (content.includes("UseGuards")) {
    imports = imports.replace("import { UseGuards } from \"@nestjs/common\";\n", "");
  }

  const decorator = "@UseGuards(" + guardsToAdd.join(", ") + ")\n@Controller";
  
  if (!content.includes("@UseGuards")) {
      content = imports + "\n" + content;
      content = content.replace(/@Controller/, decorator);
      fs.writeFileSync(file, content);
      console.log("Updated " + file);
  }
}

