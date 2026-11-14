/**
 * What the affiliate emails need to know, looked up when the job runs (db/outbox.ts jobs hold only an application id,
 * never an address). Framework-free; takes an explicit `db`.
 *
 * This runs with no signed-in user, from the outbox, so it is the third file allowed to read the affiliate tables
 * (with db/merchant-scope.ts and db/affiliate-scope.ts). It is read-only and keyed by one application id.
 */

import { sql } from 'drizzle-orm';
import type { ApplicationStatus } from '../app/lib/affiliate/application.ts';
import type { Db } from './links.ts';

export type MailContext = {
  status: ApplicationStatus;
  decisionNote: string;
  applicantName: string;
  applicantEmail: string;
  merchantName: string;
  programmeName: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
};

export async function loadMailContext(db: Db, applicationId: string): Promise<MailContext | null> {
  const res = (await db.execute(sql`
    select a.status, a.decision_note,
           coalesce(nullif(p.display_name, ''), u.name) as applicant_name, u.email as applicant_email,
           m.name as merchant_name, m.slug,
           coalesce(nullif(b.programme_name, ''), m.name || ' affiliate programme') as programme_name,
           o.name as owner_name, o.email as owner_email
    from programme_applications a
    join merchants m on m.id = a.merchant_id
    join auth_users o on o.id = m.owner_user_id
    join auth_users u on u.id = a.affiliate_user_id
    left join affiliate_profiles p on p.user_id = a.affiliate_user_id
    left join merchant_brand_settings b on b.merchant_id = m.id
    where a.id = ${applicationId}::uuid
  `)) as unknown as { rows: Record<string, unknown>[] };
  const r = res.rows[0];
  if (!r) return null;
  return {
    status: r.status as ApplicationStatus,
    decisionNote: String(r.decision_note ?? ''),
    applicantName: String(r.applicant_name ?? ''),
    applicantEmail: String(r.applicant_email),
    merchantName: String(r.merchant_name),
    programmeName: String(r.programme_name),
    slug: String(r.slug),
    ownerName: String(r.owner_name ?? ''),
    ownerEmail: String(r.owner_email),
  };
}
