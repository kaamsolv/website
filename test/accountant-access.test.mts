/**
 * A named accountant's read-only access on real Postgres (PGlite, real migrations): the invitation (one use, 7 days,
 * the invited verified address only), the grant check that every read depends on (one business, ended at once),
 * what the accountant is allowed to see of a customer, and the activity log.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sql } from 'drizzle-orm';
import { makeTestDb } from './helpers/test-db.mts';
import type { Db } from '../db/links.ts';
import { authUsers } from '../db/schema.ts';
import { createCustomer } from '../db/directory.ts';
import { acceptInvite, clientsOf, customersView, grantFor, invite, inviteTarget, listAccess, logEvent, peekInvite, recentEvents, revoke } from '../db/accountant-access.ts';
import { ACCESS_CAN, ACCESS_CANNOT, MAX_ACCOUNTANTS, checkInvite, inviteEmail } from '../app/lib/invoice/accountant-access.ts';

let db: Db;
let close: () => Promise<void>;
before(async () => ({ db, close } = await makeTestDb()));
after(async () => close());

const SECRET = 'access-test-secret';

async function user(email: string, verified = true): Promise<{ id: string; email: string }> {
  const [u] = await db.insert(authUsers).values({ name: email.split('@')[0], email, emailVerified: verified }).returning({ id: authUsers.id });
  return { id: u.id, email };
}
const who = (u: { id: string; email: string }, emailVerified = true) => ({ id: u.id, email: u.email, emailVerified });

// ---- pure ---------------------------------------------------------------------------------------------------

test('an invitation needs a name and a real email, and not the owner’s own address; the email says what access means', () => {
  assert.deepEqual(checkInvite(' CA  Mehta ', ' CA@Example.TEST ', 'owner@example.test'), { ok: true, name: 'CA Mehta', email: 'ca@example.test' });
  assert.equal(checkInvite('CA', 'OWNER@example.test', 'owner@example.test').ok, false);
  assert.equal(checkInvite('', 'ca@example.test', 'o@x.test').ok, false);
  assert.equal(checkInvite('CA', 'nope', 'o@x.test').ok, false);
  const e = inviteEmail({ accountantName: 'CA', businessName: 'ABC <Studio>', url: 'https://kaamsolv.test/accountant/accept/abc' });
  assert.match(e.text, /read-only/);
  assert.match(e.text, /expires in 7 days/);
  for (const line of [...ACCESS_CAN, ...ACCESS_CANNOT]) assert.ok(e.text.includes(line.split('.')[0]), line);
  assert.doesNotMatch(e.html, /<Studio>/);
});

// ---- the invitation ------------------------------------------------------------------------------------------

test('a new invitation replaces the old link; only the invited, verified address can accept, once', async () => {
  const owner = await user('o1@example.test');
  const ca = await user('ca1@example.test');
  const stranger = await user('stranger1@example.test');
  const first = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  assert.ok(first.ok);
  const t1 = first.ok ? first.token : '';
  const second = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  assert.ok(second.ok);
  const t2 = second.ok ? second.token : '';
  assert.notEqual(t1, t2);
  assert.equal(await peekInvite(db, t1), null, 'the older link stopped working');
  assert.deepEqual(await peekInvite(db, t2), { name: 'CA', email: ca.email, businessName: '' });

  assert.equal(await acceptInvite(db, t2, who(stranger)), 'wrong_account');
  assert.ok(await peekInvite(db, t2), 'a wrong person trying does not use it up');
  assert.equal(await acceptInvite(db, t2, who(ca, false)), 'unverified');
  assert.equal(await grantFor(db, ca.id, owner.id), null, 'nothing is granted before accepting');
  assert.equal(await acceptInvite(db, t2, { id: ca.id, email: ' CA1@Example.TEST ', emailVerified: true }), 'ok', 'the address is compared without case');
  assert.equal(await acceptInvite(db, t2, who(ca)), 'invalid', 'works once');
  assert.equal(await acceptInvite(db, 'x'.repeat(22), who(ca)), 'invalid');
  assert.equal(await acceptInvite(db, '../../etc', who(ca)), 'invalid');
  assert.ok(await grantFor(db, ca.id, owner.id));
});

test('an expired invitation cannot be accepted', async () => {
  const owner = await user('o2@example.test');
  const ca = await user('ca2@example.test');
  const r = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  assert.ok(r.ok);
  await db.execute(sql`update accountant_access set invite_expires_at = now() - interval '1 minute' where owner_id = ${owner.id}::uuid`);
  assert.equal(await acceptInvite(db, r.ok ? r.token : '', who(ca)), 'invalid');
  assert.equal((await listAccess(db, owner.id))[0].inviteExpired, true);
  const again = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  assert.ok(again.ok);
  assert.equal(await acceptInvite(db, again.ok ? again.token : '', who(ca)), 'ok', 'a fresh invitation works');
});

test('an address that already has access cannot be re-invited, and an owner has at most five accountants at once', async () => {
  const owner = await user('o3@example.test');
  const ca = await user('ca3@example.test');
  const r = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  await acceptInvite(db, r.ok ? r.token : '', who(ca));
  assert.deepEqual(await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email }), { ok: false, reason: 'already_active' });
  assert.ok(await grantFor(db, ca.id, owner.id), 'the failed re-invite did not disturb their access');
  for (let i = 1; i < MAX_ACCOUNTANTS; i++) assert.ok((await invite(db, owner.id, SECRET, { name: `X${i}`, email: `x${i}-o3@example.test` })).ok);
  assert.deepEqual(await invite(db, owner.id, SECRET, { name: 'Y', email: 'y-o3@example.test' }), { ok: false, reason: 'too_many' });
});

// ---- the grant -----------------------------------------------------------------------------------------------

test('access is one business: another owner’s books, a stranger, and a signed-out request all get no grant', async () => {
  const a = await user('oa@example.test');
  const b = await user('ob@example.test');
  const ca = await user('ca4@example.test');
  const other = await user('ca4b@example.test');
  const r = await invite(db, a.id, SECRET, { name: 'CA', email: ca.email });
  await acceptInvite(db, r.ok ? r.token : '', who(ca));
  assert.ok(await grantFor(db, ca.id, a.id));
  assert.equal(await grantFor(db, ca.id, b.id), null, 'not the other business');
  assert.equal(await grantFor(db, other.id, a.id), null, 'not another person');
  assert.equal(await grantFor(db, a.id, a.id), null, 'not even the owner, through this door');
  assert.equal(await grantFor(db, ca.id, '00000000-0000-4000-8000-000000000000'), null);
  assert.deepEqual((await clientsOf(db, ca.id)).map((c) => c.ownerId), [a.id]);
  assert.deepEqual(await clientsOf(db, other.id), []);
});

test('revoking ends access on the very next check, cancels an open invitation, and a new invitation starts from nothing', async () => {
  const owner = await user('o5@example.test');
  const ca = await user('ca5@example.test');
  const r = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  const id = r.ok ? r.accessId : '';
  assert.equal(await revoke(db, (await user('o5b@example.test')).id, id), false, 'only the owner can revoke');
  await acceptInvite(db, r.ok ? r.token : '', who(ca));
  assert.ok(await grantFor(db, ca.id, owner.id));
  assert.equal(await revoke(db, owner.id, id), true);
  assert.equal(await grantFor(db, ca.id, owner.id), null);
  assert.deepEqual(await clientsOf(db, ca.id), []);
  assert.equal(await revoke(db, owner.id, id), false, 'already ended');

  const open = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  assert.ok(open.ok);
  assert.equal(await grantFor(db, ca.id, owner.id), null, 'a new invitation does not restore access by itself');
  assert.equal(await inviteTarget(db, owner.id, id).then((t) => t?.email), ca.email);
  assert.equal(await revoke(db, owner.id, id), true, 'cancelling the invitation');
  assert.equal(await peekInvite(db, open.ok ? open.token : ''), null);
});

test('deleting the accountant’s account ends their access', async () => {
  const owner = await user('o6@example.test');
  const ca = await user('ca6@example.test');
  const r = await invite(db, owner.id, SECRET, { name: 'CA', email: ca.email });
  await acceptInvite(db, r.ok ? r.token : '', who(ca));
  await db.execute(sql`delete from auth_users where id = ${ca.id}::uuid`);
  assert.equal(await grantFor(db, ca.id, owner.id), null);
  assert.equal((await listAccess(db, owner.id))[0].status, 'active', 'the row remains for the owner’s record');
});

// ---- what an accountant may see ------------------------------------------------------------------------------

test('customers are shown as name, GSTIN and state only, and only the owner’s own', async () => {
  const a = await user('oc@example.test');
  const b = await user('ocb@example.test');
  const c = await createCustomer(db, a.id, { name: 'Acme Traders', contactName: 'Priya', email: 'priya@acme.test', phone: '9999999999', address: '1 MG Road', stateCode: '27', gstin: '27AAAAA0000A1Z5' }, null);
  assert.ok(c.ok);
  await createCustomer(db, b.id, { name: 'Other Co', contactName: '', email: '', phone: '', address: '', stateCode: '29', gstin: '' }, null);
  const v = await customersView(db, a.id, 1);
  assert.deepEqual(v.rows, [{ name: 'Acme Traders', gstin: '27AAAAA0000A1Z5', state: '27' }]);
  assert.equal(v.matched, 1);
  assert.doesNotMatch(JSON.stringify(v), /priya|9999999999|MG Road/i);
});

// ---- the log -------------------------------------------------------------------------------------------------

test('the log records invitation, acceptance, opens, downloads and revocation, repeats of one view within the hour once, and only the owner’s own', async () => {
  const owner = await user('o7@example.test');
  const other = await user('o7b@example.test');
  const ca = await user('ca7@example.test');
  const r = await invite(db, owner.id, SECRET, { name: 'CA Seven', email: ca.email });
  const id = r.ok ? r.accessId : '';
  await acceptInvite(db, r.ok ? r.token : '', who(ca));
  await logEvent(db, owner.id, id, 'viewed', 'register 2026-10');
  await logEvent(db, owner.id, id, 'viewed', 'register 2026-10');
  await logEvent(db, owner.id, id, 'viewed', 'customers');
  await logEvent(db, owner.id, id, 'downloaded', '2026-10');
  await revoke(db, owner.id, id);
  const events = await recentEvents(db, owner.id);
  assert.deepEqual(events.map((e) => e.action).sort(), ['accepted', 'downloaded', 'invited', 'revoked', 'viewed', 'viewed']);
  assert.ok(events.every((e) => e.who === 'CA Seven'));
  assert.deepEqual(await recentEvents(db, other.id), []);
  assert.ok((await listAccess(db, owner.id))[0].lastOpenedAt, 'last opened is shown');
  const row = (await db.execute(sql`select count(*)::int as n from accountant_access_events where detail like '%@%'`)).rows as { n: number }[];
  assert.equal(row[0].n, 0, 'no address or content in the log');
});
