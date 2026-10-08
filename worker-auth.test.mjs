import assert from 'node:assert';
const worker = (await import('./_worker.js')).default;
const INST = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222', USER = '33333333-3333-3333-3333-333333333333';
const calls = [];
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  url = String(url);
  const ok = (b, s = 200) => new Response(JSON.stringify(b), { status: s });
  if (url.includes('/auth/v1/user')) return (opts.headers.Authorization === 'Bearer good') ? ok({ id: USER }) : ok({ error: 'bad' }, 401);
  if (url.includes('/institute_members')) return ok(url.includes(INST) ? [{ role: 'teacher' }] : []);
  if (url.includes('/rest/v1/questions') && opts.method === 'POST') return ok([{ id: 'new-q' }]);
  if (url.includes('/rest/v1/scheduled_quizzes')) return ok(opts.method === 'POST' ? [{ id: 'x' }] : []);
  return ok([]);
};
const env = { SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPA_DB_SERVICE_KEY: 'svc2' };
const req = (path, token, init = {}) => new Request('https://x.test' + path, { ...init, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json' } });
const status = async (r) => (await worker.fetch(r, env)).status;

// scheduled-quizzes GET
assert.strictEqual(await status(req(`/api/scheduled-quizzes?institute_id=${INST}`)), 401, 'no token');
assert.strictEqual(await status(req(`/api/scheduled-quizzes?institute_id=${INST}`, 'x')), 401, 'forged token no longer accepted');
assert.strictEqual(await status(req(`/api/scheduled-quizzes?institute_id=${OTHER}`, 'good')), 403, 'not a member of that institute');
assert.strictEqual(await status(req(`/api/scheduled-quizzes`, 'good')), 400, 'institute_id required');
calls.length = 0;
assert.strictEqual(await status(req(`/api/scheduled-quizzes?institute_id=${INST}&select=*&foo=bar&limit=99999`, 'good')), 200);
const fwd = calls.find(c => c.url.includes('qnqcys') && c.url.includes('scheduled_quizzes')).url;
assert.ok(fwd.includes(`institute_id=eq.${INST}`) && !fwd.includes('foo=bar') && !fwd.includes('select=') && fwd.includes('limit=200'), fwd);
// scheduled-quizzes POST
const post = (body, t = 'good') => req('/api/scheduled-quizzes', t, { method: 'POST', body: JSON.stringify(body) });
assert.strictEqual(await status(post({ institute_id: OTHER, quiz_title: 't' })), 403, 'cannot create in another institute');
calls.length = 0;
assert.strictEqual(await status(post({ institute_id: INST, quiz_title: 't', evil_column: 1 })), 200);
const body = JSON.parse(calls.find(c => c.opts.method === 'POST' && c.url.includes('scheduled_quizzes')).opts.body);
assert.deepStrictEqual(Object.keys(body).sort(), ['institute_id', 'quiz_title']);
// moodle-config / moodle-courses
assert.strictEqual(await status(req(`/api/moodle-config?institute_id=${INST}`)), 401);
assert.strictEqual(await status(req(`/api/moodle-config?institute_id=${OTHER}`, 'good')), 403);
assert.strictEqual(await status(req(`/api/moodle-courses`, 'good', { method: 'POST', body: JSON.stringify({ institute_id: OTHER }) })), 403);
// question-analysis still enforces auth
assert.strictEqual(await status(req(`/api/question-analysis?institute_id=${INST}&test_id=1`)), 401);
assert.strictEqual(await status(req(`/api/question-analysis?institute_id=${OTHER}&test_id=1`, 'good')), 403);
console.log('all auth tests ok');
// moodle_config is read with the caller's token, not the anon key
calls.length = 0;
await status(req(`/api/moodle-config?institute_id=${INST}`, 'good'));
const cfg = calls.find(c => c.url.includes('/rest/v1/moodle_config'));
assert.ok(cfg && cfg.opts.headers.Authorization === 'Bearer good', 'moodle_config must use the caller token');
console.log('moodle_config token test ok');
// with the service-key secret set, moodle_config is read with it (not the teacher's token)
calls.length = 0;
const w2 = await worker.fetch(req(`/api/moodle-config?institute_id=${INST}`, 'good'), { ...env, MOODLE_CONFIG_SERVICE_KEY: 'cfgsvc' });
const cfg2 = calls.find(c => c.url.includes('/rest/v1/moodle_config'));
assert.strictEqual(cfg2.opts.headers.Authorization, 'Bearer cfgsvc');
console.log('service-key moodle_config test ok');
// mcq-presign / mcq-save
const envS3 = { ...env, S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 'b' };
const run = async (r, e = envS3) => (await worker.fetch(r, e)).status;
const pre = (body, t) => req('/api/mcq-presign', t, { method: 'POST', body: JSON.stringify(body) });
assert.strictEqual(await run(pre({ files: [{ key: 'a/b.png' }] })), 401, 'presign needs login');
assert.strictEqual(await run(pre({ files: [{ key: 'a/b.png' }] }, 'x')), 401, 'presign rejects forged token');
assert.strictEqual(await run(pre({ files: [{ key: '../etc/x' }] }, 'good')), 400, 'path traversal key');
assert.strictEqual(await run(pre({ files: [{ key: '/abs' }] }, 'good')), 400, 'absolute key');
assert.strictEqual(await run(pre({ files: Array.from({ length: 21 }, (_, i) => ({ key: 'k' + i })) }, 'good')), 400, 'too many files');
assert.strictEqual(await run(pre({ files: [{ key: 'mcq/ok.png' }] }, 'good')), 200, 'valid presign still works');
const sv = (body, t) => req('/api/mcq-save', t, { method: 'POST', body: JSON.stringify(body) });
const q1 = [{ question_text: 'q', correct_answer: 'A' }];
assert.strictEqual(await run(sv({ institute_id: INST, questions: q1 })), 401, 'save needs login');
assert.strictEqual(await run(sv({ institute_id: OTHER, questions: q1 }, 'good')), 403, 'save into another institute blocked');
calls.length = 0;
await run(sv({ institute_id: INST, questions: q1, subject: 'Physics', chapter: 'Kinematics' }, 'good'));
assert.ok(calls.some(c => c.url.includes('/rest/v1/questions') && c.opts.method === 'POST'), 'member save reaches the database');
console.log('presign/save auth tests ok');
// moodle-schedule
const sch = (body, t) => req('/api/moodle-schedule', t, { method: 'POST', body: JSON.stringify(body) });
assert.strictEqual(await run(sch({ institute_id: INST, name: 'q' })), 401, 'schedule needs login');
assert.strictEqual(await run(sch({ institute_id: INST, name: 'q' }, 'x')), 401, 'schedule rejects forged token');
assert.strictEqual(await run(sch({ name: 'q' }, 'good')), 400, 'institute_id required, no default tenant');
assert.strictEqual(await run(sch({ institute_id: OTHER, name: 'q' }, 'good')), 403, 'cannot schedule for another institute');
assert.strictEqual(await run(sch({ institute_id: INST, questions: 'bad' }, 'good')), 400, 'questions must be an array');
console.log('moodle-schedule auth tests ok');
// question-bank
const qb = (qs, t) => req('/api/question-bank?' + qs, t);
assert.strictEqual(await run(qb(`institute_id=${INST}`)), 401, 'question bank needs login');
assert.strictEqual(await run(qb(`institute_id=${INST}`, 'x')), 401);
assert.strictEqual(await run(qb(`institute_id=${OTHER}`, 'good')), 403);
calls.length = 0;
assert.strictEqual(await run(qb(`institute_id=${INST}&class=11&subject=Phy*sics,(x)&limit=99999&select=*&evil=1`, 'good')), 200);
const f = calls.find(c => c.url.includes('qnqcys') && c.url.includes('/rest/v1/questions')).url;
assert.ok(f.includes('is_active=eq.true') && f.includes('class=eq.11') && f.includes('subject=eq.Physicsx') && f.includes('limit=1000') && !f.includes('evil') && !f.includes('select=*'), f);
console.log('question-bank tests ok');
