/**
 * QR campaigns — data access (Pro: `qr_campaigns`; docs/products/qr-tracking.md).
 *
 * A campaign only groups codes. Nothing here reads or writes `links`, so
 * creating, renaming, assigning or deleting a campaign can never change where a
 * code points, whether it is paused, or its scans. Every query is scoped by
 * `user_id`. Framework-free; takes an explicit `db`.
 */

import { and, eq, sql } from 'drizzle-orm';
import { CAMPAIGN_CAP, type CampaignInput } from '../app/lib/qr/campaigns.ts';
import { isUniqueViolation, type Db } from './links.ts';
import { links, qrCampaigns, qrCodes } from './schema.ts';

export type CampaignSummary = {
  id: string;
  name: string;
  description: string;
  startsOn: string | null;
  endsOn: string | null;
  /** Codes in the campaign. */
  codes: number;
  /** All-time scans of those codes (people only), each code counted once. */
  scans: number;
  createdAt: Date;
};

/** Campaigns with their code counts and all-time scans, newest first. One query, no per-campaign lookups. */
export async function listCampaigns(db: Db, userId: string): Promise<CampaignSummary[]> {
  const result = await db.execute<{
    id: string; name: string; description: string; starts_on: string | null; ends_on: string | null;
    codes: number; scans: string | number; created_at: string | Date;
  }>(sql`
    select c.id, c.name, c.description, c.starts_on::text as starts_on, c.ends_on::text as ends_on, c.created_at,
           count(q.id)::int as codes, coalesce(sum(l.click_count), 0)::float8 as scans
    from ${qrCampaigns} c
    left join ${qrCodes} q on q.campaign_id = c.id and q.user_id = c.user_id
    left join ${links} l on l.id = q.link_id
    where c.user_id = ${userId}::uuid
    group by c.id
    order by c.created_at desc`);
  return (result as unknown as { rows: Parameters<typeof toSummary>[0][] }).rows.map(toSummary);
}

function toSummary(r: { id: string; name: string; description: string; starts_on: string | null; ends_on: string | null; codes: number; scans: string | number; created_at: string | Date }): CampaignSummary {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    codes: Number(r.codes),
    scans: Number(r.scans),
    createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
  };
}

export async function getCampaign(db: Db, userId: string, id: string): Promise<CampaignSummary | null> {
  return (await listCampaigns(db, userId)).find((c) => c.id === id) ?? null;
}

export async function countCampaigns(db: Db, userId: string): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${qrCampaigns} where ${qrCampaigns.userId} = ${userId}::uuid`);
  return Number((result as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0);
}

export type CampaignWrite = { ok: true; id: string } | { ok: false; reason: 'duplicate_name' | 'cap' | 'not_found' };

/** Create one. The 50-campaign ceiling is checked in the same statement; a name already used (any case) is `duplicate_name`. */
export async function createCampaign(db: Db, userId: string, input: CampaignInput): Promise<CampaignWrite> {
  try {
    const result = await db.execute<{ id: string }>(sql`
      insert into ${qrCampaigns} (user_id, name, description, starts_on, ends_on)
      select ${userId}::uuid, ${input.name}, ${input.description}, ${input.startsOn}::date, ${input.endsOn}::date
      where (select count(*) from ${qrCampaigns} where ${qrCampaigns.userId} = ${userId}::uuid) < ${CAMPAIGN_CAP}
      returning id`);
    const row = (result as unknown as { rows: { id: string }[] }).rows[0];
    return row ? { ok: true, id: row.id } : { ok: false, reason: 'cap' };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate_name' };
    throw err;
  }
}

export async function updateCampaign(db: Db, userId: string, id: string, input: CampaignInput): Promise<CampaignWrite> {
  try {
    const rows = await db
      .update(qrCampaigns)
      .set({ name: input.name, description: input.description, startsOn: input.startsOn, endsOn: input.endsOn, updatedAt: new Date() })
      .where(and(eq(qrCampaigns.id, id), eq(qrCampaigns.userId, userId)))
      .returning({ id: qrCampaigns.id });
    return rows.length ? { ok: true, id } : { ok: false, reason: 'not_found' };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: 'duplicate_name' };
    throw err;
  }
}

/** Delete a campaign. Its codes are ungrouped (FK SET NULL) — never deleted, never changed otherwise. */
export async function deleteCampaign(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(qrCampaigns)
    .where(and(eq(qrCampaigns.id, id), eq(qrCampaigns.userId, userId)))
    .returning({ id: qrCampaigns.id });
  return rows.length > 0;
}

/**
 * Put a code in a campaign, or take it out (`campaignId` null). One statement
 * that touches only `qr_codes.campaign_id`, and only when the code *and* the
 * campaign are both the user's own. False otherwise.
 */
export async function setQrCampaign(db: Db, userId: string, qrId: string, campaignId: string | null): Promise<boolean> {
  const result = await db.execute<{ id: string }>(sql`
    update ${qrCodes}
       set campaign_id = ${campaignId}::uuid, updated_at = now()
     where ${qrCodes.id} = ${qrId}::uuid and ${qrCodes.userId} = ${userId}::uuid
       and (${campaignId}::uuid is null
            or exists (select 1 from ${qrCampaigns} where ${qrCampaigns.id} = ${campaignId}::uuid and ${qrCampaigns.userId} = ${userId}::uuid))
    returning ${qrCodes.id} as id`);
  return (result as unknown as { rows: unknown[] }).rows.length > 0;
}
