import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eq, sql } from 'drizzle-orm';
import { affiliateScope } from '../db/affiliate-scope.ts';
import { createMerchant, merchantScope } from '../db/merchant-scope.ts';
import { claimDue } from '../db/outbox.ts';
import { authUsers } from '../db/schema.ts';
import type { Db } from '../db/links.ts';
import { AFFILIATE_EMAIL_FROM } from '../app/lib/email.ts';
import { applicationDecisionEmail, applicationReceivedEmail } from '../app/lib/affiliate/email.ts';
import { affiliateDecisionJob, affiliateReceivedJob } from '../app/lib/affiliate/mail-jobs.ts';
import { makeTestDb } from './helpers/test-db.mts';

const brand = { logo: null, brandColour: '#FE6336', programmeName: 'Wandernest Partners', programmeDescription: '', terms: '' };
const rows = <T,>(r: unknown) => (r as { rows: T[] }).rows;

async function user(db: Db, email: string, name = 'T'): Promise<string> {
  const [r] = await db.insert(authUsers).values({ name, email }).returning({ id: authUsers.id });
  return r.id;
}
async function world(db: Db) {
  const oa = await user(db, 'oa@example.test', 'Asha Owner');
  const ob = await user(db, 'ob@example.test', 'Bela Owner');
  const ra = await createMerchant(db, oa, { slug: 'merchant-a', name: 'Merchant A', brand });
  const rb = await createMerchant(db, ob, { slug: 'merchant-b', name: 'Merchant B', brand: { ...brand, programmeName: '' } });
  assert.ok(ra.ok && rb.ok);
  const ma = (ra as { id: string }).id;
  const mb = (rb as { id: string }).id;
  await merchantScope(db, ma).setProgrammeStatus('open', oa);
  await merchantScope(db, mb).setProgrammeStatus('open', ob);
  const aff = await user(db, 'riya@example.test', 'Riya Sen');
  await affiliateScope(db, aff).saveProfile({ displayName: 'Riya Sen', website: '' });
  return { oa, ob, ma, mb, aff };
}
const events = async (db: Db, merchantId: string) =>
  rows<{ action: string }>(await db.execute(sql`select action from affiliate_events where merchant_id = ${merchantId}::uuid order by id`)).map((r) => r.action);

async function approved(db: Db) {
  const w = await world(db);
  const applied = await affiliateScope(db, w.aff).apply('merchant-a', 'hello', { category: 'teacher', channel: 'instagram', country: 'India' });
  assert.ok(applied.ok);
  const id = (applied as { id: string }).id;
  assert.equal(await merchantScope(db, w.ma).decide(id, 'approved', w.oa, 'Welcome aboard'), true);
  return { ...w, id };
}

test('the optional answers are saved with the application and shown to the merchant', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    assert.ok((await affiliateScope(db, w.aff).apply('merchant-a', 'hi', { category: 'teacher', channel: 'instagram', country: 'India' })).ok);
    const [row] = await merchantScope(db, w.ma).listApplications();
    assert.deepEqual([row.category, row.channel, row.country], ['teacher', 'instagram', 'India']);

    // Blank is fine, and the database refuses a key that isn't on the lists.
    const other = await user(db, 'other@example.test');
    assert.ok((await affiliateScope(db, other).apply('merchant-b', '')).ok);
    const [blank] = await merchantScope(db, w.mb).listApplications();
    assert.deepEqual([blank.category, blank.channel, blank.country], ['', '', '']);
    await assert.rejects(db.execute(sql`update programme_applications set category = 'wizard'`));
  } finally {
    await close();
  }
});

test('the reason on a decision reaches the affiliate', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const a = await affiliateScope(db, w.aff).apply('merchant-a', '');
    await merchantScope(db, w.ma).decide((a as { id: string }).id, 'rejected', w.oa, 'We need a bigger audience first');
    const [mine] = await affiliateScope(db, w.aff).list();
    assert.equal(mine.status, 'rejected');
    assert.equal(mine.decisionNote, 'We need a bigger audience first');
  } finally {
    await close();
  }
});

test('suspend and reinstate: access pauses, the reason is shown, events are written, nothing else changes', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await approved(db);
    const scope = merchantScope(db, w.ma);
    const me = affiliateScope(db, w.aff);

    assert.equal(await scope.setMembership(w.id, 'suspended', w.oa, 'Posted off-brand content'), true);
    const [row] = await scope.listApplications('approved');
    assert.equal(row.membership, 'suspended');
    assert.equal(row.suspendNote, 'Posted off-brand content');
    assert.equal(row.status, 'approved', 'the application itself stays approved');

    const [mine] = await me.list();
    assert.equal(mine.membership, 'suspended');
    assert.equal(mine.suspendNote, 'Posted off-brand content');
    assert.equal(await me.registrationState('merchant-a'), 'suspended');
    assert.deepEqual(await me.apply('merchant-a', ''), { ok: false, block: 'suspended' }, 'a paused affiliate can’t apply again');

    assert.equal(await scope.setMembership(w.id, 'suspended', w.oa, ''), false, 'already suspended: nothing changes');
    assert.equal(await scope.setMembership(w.id, 'active', w.oa, ''), true);
    assert.equal((await scope.listApplications('approved'))[0].membership, 'active');
    assert.equal((await scope.listApplications('approved'))[0].suspendNote, '', 'the old reason is cleared on reinstating');
    assert.equal(await me.registrationState('merchant-a'), 'approved');
    assert.equal(await scope.setMembership(w.id, 'active', w.oa, ''), false, 'already active: nothing changes');

    assert.deepEqual(await events(db, w.ma), ['portal_created', 'programme_opened', 'applied', 'approved', 'suspended', 'reinstated']);
  } finally {
    await close();
  }
});

test('suspend only works on an approved affiliate of this merchant', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await approved(db);
    // Pending or rejected applications can't be suspended.
    const other = await user(db, 'other@example.test');
    const pending = await affiliateScope(db, other).apply('merchant-a', '');
    assert.equal(await merchantScope(db, w.ma).setMembership((pending as { id: string }).id, 'suspended', w.oa, ''), false);

    // ISOLATION: merchant B holding A's application id changes nothing, and logs nothing against B.
    assert.equal(await merchantScope(db, w.mb).setMembership(w.id, 'suspended', w.ob, 'nope'), false);
    assert.equal((await merchantScope(db, w.ma).listApplications('approved'))[0].membership, 'active');
    assert.ok(!(await events(db, w.mb)).includes('suspended'));
  } finally {
    await close();
  }
});

test('portal edits are recorded, in the same statement as the edit', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const scope = merchantScope(db, w.ma);
    await scope.savePortal('Merchant A renamed', { ...brand, programmeName: 'New name', terms: 'New terms' }, w.oa);
    const m = await scope.read();
    assert.equal(m?.name, 'Merchant A renamed');
    assert.equal(m?.brand.programmeName, 'New name');
    assert.equal(m?.slug, 'merchant-a');
    assert.deepEqual((await events(db, w.ma)).slice(-1), ['portal_edited']);
    assert.deepEqual(await events(db, w.mb), ['portal_created', 'programme_opened'], 'B’s history is untouched');
    // A scope for a merchant that doesn't exist changes and logs nothing.
    await merchantScope(db, '11111111-1111-4111-8111-111111111111').savePortal('x', brand, w.oa);
    assert.equal(rows(await db.execute(sql`select 1 from affiliate_events where action = 'portal_edited'`)).length, 1);
  } finally {
    await close();
  }
});

test('the emails are queued with the application and with the decision, once each', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const a = await affiliateScope(db, w.aff).apply('merchant-a', '');
    const id = (a as { id: string }).id;
    let jobs = await claimDue(db, 10);
    assert.deepEqual(jobs.map((j) => [j.kind, j.dedupeKey, j.payload]), [['affiliate_received', `affiliate_received:${id}`, { applicationId: id }]]);
    assert.ok(!JSON.stringify(jobs).includes('example.test'), 'the job holds an id, never an address');

    await merchantScope(db, w.ma).decide(id, 'approved', w.oa, '');
    await merchantScope(db, w.ma).decide(id, 'rejected', w.oa, ''); // already decided: no second job
    jobs = (await claimDue(db, 10)).filter((j) => j.kind === 'affiliate_decision');
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].dedupeKey, `affiliate_decision:${id}`);

    // A refused application queues nothing.
    const other = await user(db, 'closed@example.test');
    await merchantScope(db, w.mb).setProgrammeStatus('closed', w.ob);
    await affiliateScope(db, other).apply('merchant-b', '');
    assert.equal(rows(await db.execute(sql`select 1 from outbox where kind = 'affiliate_received'`)).length, 1);
  } finally {
    await close();
  }
});

test('the received email goes to the merchant owner, with a link to the inbox', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const a = await affiliateScope(db, w.aff).apply('merchant-a', '');
    const id = (a as { id: string }).id;
    const sent: { to: string; subject: string; text: string; from?: string; key?: string }[] = [];
    const send = async (e: { to: string; subject: string; text: string }, from?: string, key?: string) => {
      sent.push({ ...e, from, key });
      return { ok: true as const, id: 'mail_1' };
    };
    const job = { id: 'j', kind: 'affiliate_received', dedupeKey: `affiliate_received:${id}`, payload: { applicationId: id }, attempts: 1 };
    const out = await affiliateReceivedJob(db, job, { send: send as never, env: { NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.com' } });
    assert.deepEqual(out, { result: 'sent', ref: 'mail_1' });
    assert.equal(sent[0].to, 'oa@example.test');
    assert.match(sent[0].subject, /New application to Wandernest Partners/);
    assert.match(sent[0].text, /Riya Sen has applied/);
    assert.match(sent[0].text, /https:\/\/kaamsolv\.com\/app\/affiliate\/applications\?status=pending/);
    assert.equal(sent[0].from, AFFILIATE_EMAIL_FROM);
    assert.equal(sent[0].key, job.dedupeKey, 'the same job never sends twice');
    assert.ok(!sent[0].text.includes('riya@example.test'), 'the merchant is pointed at the inbox, not given the address in the email');
  } finally {
    await close();
  }
});

test('the decision emails go to the affiliate: approved says so, not approved gives the reason and the wait', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const send = (log: { to: string; subject: string; text: string }[]) => async (e: { to: string; subject: string; text: string }) => {
      log.push(e);
      return { ok: true as const, id: 'mail_2' };
    };
    const env = { NEXT_PUBLIC_SITE_URL: 'https://kaamsolv.com' };

    const a = await affiliateScope(db, w.aff).apply('merchant-a', '');
    const id = (a as { id: string }).id;
    await merchantScope(db, w.ma).decide(id, 'approved', w.oa, 'Welcome aboard');
    const yes: { to: string; subject: string; text: string }[] = [];
    await affiliateDecisionJob(db, { id: 'j', kind: 'affiliate_decision', dedupeKey: `affiliate_decision:${id}`, payload: { applicationId: id }, attempts: 1 }, { send: send(yes) as never, env });
    assert.equal(yes[0].to, 'riya@example.test');
    assert.match(yes[0].subject, /You’re in: Wandernest Partners/);
    assert.match(yes[0].text, /Welcome aboard/);
    assert.match(yes[0].text, /kaamsolv\.com\/app\/affiliate\/programmes/);

    const other = await user(db, 'sam@example.test', 'Sam');
    const b = await affiliateScope(db, other).apply('merchant-b', '');
    const idB = (b as { id: string }).id;
    await merchantScope(db, w.mb).decide(idB, 'rejected', w.ob, 'Not the right fit right now');
    const no: { to: string; subject: string; text: string }[] = [];
    await affiliateDecisionJob(db, { id: 'j2', kind: 'affiliate_decision', dedupeKey: `affiliate_decision:${idB}`, payload: { applicationId: idB }, attempts: 1 }, { send: send(no) as never, env });
    assert.equal(no[0].to, 'sam@example.test');
    assert.match(no[0].subject, /Your application to Merchant B affiliate programme/);
    assert.match(no[0].text, /didn't approve/);
    assert.match(no[0].text, /Not the right fit right now/);
    assert.match(no[0].text, /apply again after 7 days/);
    assert.match(no[0].text, /kaamsolv\.com\/affiliate\/merchant-b/);
  } finally {
    await close();
  }
});

test('mail jobs: no key set means blocked, a provider error means retry, a deleted application is skipped, a pending one sends nothing', async () => {
  const { db, close } = await makeTestDb();
  try {
    const w = await world(db);
    const a = await affiliateScope(db, w.aff).apply('merchant-a', '');
    const id = (a as { id: string }).id;
    const job = (kind: string, appId: string) => ({ id: 'j', kind, dedupeKey: `${kind}:${appId}`, payload: { applicationId: appId }, attempts: 1 });
    const failWith = (code: string) => async () => ({ ok: false as const, code });

    assert.deepEqual(await affiliateReceivedJob(db, job('affiliate_received', id), { send: failWith('email_not_configured') as never }), { result: 'blocked', code: 'email_not_configured' });
    assert.deepEqual(await affiliateReceivedJob(db, job('affiliate_received', id), { send: failWith('email_rejected_500') as never }), { result: 'retry', code: 'email_rejected_500' });

    let called = 0;
    const counting = async () => {
      called++;
      return { ok: true as const, id: 'x' };
    };
    const pending = await affiliateDecisionJob(db, job('affiliate_decision', id), { send: counting as never });
    assert.deepEqual(pending, { result: 'sent', ref: 'skipped:not_decided' });
    const ghost = await affiliateDecisionJob(db, job('affiliate_decision', '11111111-1111-4111-8111-111111111111'), { send: counting as never });
    assert.deepEqual(ghost, { result: 'sent', ref: 'skipped:application_gone' });
    assert.equal(called, 0);
    await db.delete(authUsers).where(eq(authUsers.id, w.aff));
    assert.deepEqual(await affiliateReceivedJob(db, job('affiliate_received', id), { send: counting as never }), { result: 'sent', ref: 'skipped:application_gone' });
  } finally {
    await close();
  }
});

test('email templates are plain, name the right people, and escape what people typed', () => {
  const evil = '<script>alert(1)</script> & "co"';
  const received = applicationReceivedEmail({ to: 'o@example.test', ownerName: 'Asha Rao', applicantName: evil, programmeName: 'P & Q', reviewUrl: 'https://kaamsolv.com/x?a=1&b=2' });
  assert.ok(!received.html.includes('<script>'));
  assert.match(received.html, /&lt;script&gt;/);
  assert.match(received.html, /P &amp; Q/);
  assert.match(received.html, /href="https:\/\/kaamsolv\.com\/x\?a=1&amp;b=2"/);
  assert.match(received.text, /Hi Asha,/);
  assert.match(received.html, /Kaam<span style="color:#FE6336">Solv<\/span>/);

  const yes = applicationDecisionEmail({ to: 'a@example.test', name: 'Riya Sen', merchantName: 'M', programmeName: 'P', approved: true, note: '', programmesUrl: 'u', portalUrl: 'p' });
  assert.ok(!yes.text.includes('A note from'), 'no empty note line');
  const no = applicationDecisionEmail({ to: 'a@example.test', name: '', merchantName: 'M', programmeName: 'P', approved: false, note: evil, programmesUrl: 'u', portalUrl: 'p' });
  assert.match(no.text, /^Hi there,/);
  assert.ok(!no.html.includes('<script>'));
});
