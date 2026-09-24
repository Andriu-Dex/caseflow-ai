import { z } from 'zod';

// Read-only discovery for the frontend (Phase I): Identity/Workspace
// management remains deferred (DEC-115), but the current no-auth MVP still
// needs a way to list the workspace(s) that already exist in the database
// without a hardcoded UUID in the client.
export const workspaceResponseSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
});
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;

export const workspaceListResponseSchema = z.object({
  items: z.array(workspaceResponseSchema),
});
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
