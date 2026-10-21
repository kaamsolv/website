/**
 * Account-level operations that span tables.
 *
 * Deleting a user cascades to sessions, sign-in methods, subscriptions,
 * business profile and invoices (ON DELETE CASCADE, migration 0003). Pending
 * sign-in-link rows have no user FK — they hold the email inside `value` — so
 * they are removed by email. Framework-free; takes an explicit `db`.
 */

import { eq, sql } from 'drizzle-orm';
import type { Db } from './links.ts';
import { authUsers, authVerifications } from './schema.ts';

export async function deleteAccount(db: Db, userId: string, email: string): Promise<void> {
  await db.delete(authUsers).where(eq(authUsers.id, userId));
  await db
    .delete(authVerifications)
    .where(
      sql`case when ${authVerifications.value} ~ '^\\s*\\{' then lower(${authVerifications.value}::jsonb ->> 'email') end = ${email.toLowerCase()}`,
    );
}
