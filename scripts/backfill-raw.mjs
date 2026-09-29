import 'dotenv/config';
import { Client } from 'pg';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const ownerEmail = process.env.BACKFILL_OWNER_EMAIL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required.');
  if (!ownerEmail)
    throw new Error('Set BACKFILL_OWNER_EMAIL to the account designated to own legacy data.');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    const { rows: users } = await client.query('SELECT id FROM users WHERE email = $1', [
      ownerEmail,
    ]);
    if (users.length !== 1)
      throw new Error(`No unique account found for BACKFILL_OWNER_EMAIL=${ownerEmail}.`);
    const ownerId = users[0].id;
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       SELECT w.id, $1, 'OWNER'::workspace_role
       FROM workspaces w
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [ownerId],
    );
    await client.query(
      `INSERT INTO project_memberships (project_id, user_id, role)
       SELECT p.id, $1, 'OWNER'::project_role
       FROM projects p
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [ownerId],
    );
    await client.query('COMMIT');
    console.log(`Granted ${ownerEmail} owner access to legacy project workspaces and projects.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main();
