// Runs before every integration test file.
//
// Re-points DATABASE_URL at DATABASE_TEST_URL so that any code that falls back
// to DATABASE_URL still lands in the test database, and refuses to continue if
// the test database is not clearly separate from the development database.

import { assertIsolatedTestTarget } from './test-database';

const testUrl = process.env.DATABASE_TEST_URL;
if (!testUrl) {
  throw new Error(
    'DATABASE_TEST_URL is not set. Set it to a connection string for the caseflow_test database.',
  );
}

assertIsolatedTestTarget(process.env.DATABASE_URL, testUrl);
process.env.DATABASE_URL = testUrl;
