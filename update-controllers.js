const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'apps/api/src');
const controllers = [];

function findControllers(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      findControllers(fullPath);
    } else if (file.endsWith('.controller.ts')) {
      controllers.push(fullPath);
    }
  }
}

findControllers(srcDir);

for (const file of controllers) {
  if (file.includes('health.controller.ts') || file.includes('auth.controller.ts')) {
    continue;
  }

  let content = fs.readFileSync(file, 'utf8');
  let guardsToAdd = ['JwtAuthGuard'];
  
  if (content.includes('@Param(\'projectId\'') || content.includes('@Query(\'projectId\'') || content.includes('@Body(\'projectId\'')) {
    guardsToAdd.push('ProjectMembershipGuard');
  }
  if (content.includes('@Param(\'workspaceId\'') || content.includes('query.workspaceId')) {
    guardsToAdd.push('WorkspaceMembershipGuard');
  }
  // Let's just blindly add guards based on params in the controller text
  if (content.includes('projectId')) guardsToAdd.push('ProjectMembershipGuard');
  if (content.includes('workspaceId')) guardsToAdd.push('WorkspaceMembershipGuard');
  
  guardsToAdd = [...new Set(guardsToAdd)];

  // add imports
  const importStatement = import { UseGuards } from '@nestjs/common';\nimport {  } from '../identity/';;
  // let's do precise imports
  let imports = import { UseGuards } from '@nestjs/common';\n;
  if (guardsToAdd.includes('JwtAuthGuard')) imports += import { JwtAuthGuard } from '../identity/jwt-auth.guard';\n;
  if (guardsToAdd.includes('ProjectMembershipGuard')) imports += import { ProjectMembershipGuard } from '../identity/project-membership.guard';\n;
  if (guardsToAdd.includes('WorkspaceMembershipGuard')) imports += import { WorkspaceMembershipGuard } from '../identity/workspace-membership.guard';\n;

  // check if UseGuards already imported
  if (content.includes('UseGuards')) {
    // skip adding UseGuards import, just add the custom ones
    imports = imports.replace(import { UseGuards } from '@nestjs/common';\n, '');
  }

  // add the decorator
  const decorator = @UseGuards()\n@Controller;
  
  if (!content.includes('@UseGuards')) {
      content = imports + '\n' + content;
      content = content.replace(/@Controller/, decorator);
      fs.writeFileSync(file, content);
      console.log('Updated ' + file);
  }
}
