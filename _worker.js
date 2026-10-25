const SUPABASE_URL = 'https://lekvzyoarawotlsbeoqa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3Z6eW9hcmF3b3Rsc2Jlb3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTgzNTIsImV4cCI6MjA5Mzg3NDM1Mn0.KO-UyQerUdbxxhqBDX5F51ZMU2WGIi6BLg-b-rDALmk';

// ── Non-secret config (secrets come from env: S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, SUPA_DB_SERVICE_KEY) ──
const S3_ENDPOINT = 'https://s3.ap-northeast-1.idrivee2.com';
const S3_REGION   = 'ap-northeast-1';
const S3_BUCKET   = 'mcq-supabase';
// Teacher MCQs are saved into the "Pitthugram Onboarding Project" Supabase (SUPA_B)
const SAVE_DB_URL = 'https://zqrswemxmhjaylsuulyu.supabase.co';
const QB_SUPABASE_URL = 'https://qnqcysdeolnooxxcafwz.supabase.co';
const QB_SERVICE_KEY = '';

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        if (path === '/api/login') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleLogin(request);
        }
        if (path === '/api/verify') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleVerify(request);
        }
                if (path === '/api/moodle-schedule') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleMoodleSchedule(request, env);
        }
        if (path === '/api/moodle-courses') {
            return handleMoodleCourses(request, env);
        }
        if (path === '/api/question-bank') {
            if (method === 'GET') return handleQuestionBank(request, env);
            if (method === 'DELETE') return handleQuestionDelete(request, env);
            return new Response('Method Not Allowed', { status: 405 });
        }
        if (path === '/api/question-delete') {
            if (method !== 'DELETE' && method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleQuestionDelete(request, env);
        }
        if (path === '/api/question-analysis') {
            if (method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
            return handleQuestionAnalysis(request, env);
        }
        if (path === '/api/moodle-config') {
            if (method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
            return handleMoodleConfig(request, env);
        }
        if (path === '/api/mcq-presign') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleMcqPresign(request, env);
        }
        if (path === '/api/mcq-save') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleMcqSave(request, env);
        }
                if (path === '/api/trial') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleTrial(request, env);
        }
        if (path === '/api/scheduled-quizzes') {
            return handleScheduledQuizzes(request, env);
        }
        if (path === '/api/hubspot-lead') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleHubspotLead(request, env);
        }

        // Serve static assets for everything else
        return env.ASSETS.fetch(request);
    }
};

// ── Auth helper: validate the caller's Supabase session and institute role ──────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function authenticateUser(request) {
    const h = request.headers.get('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!token) return { error: json({ error: 'Unauthorized.' }, 401) };
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` } });
    if (!uRes.ok) return { error: json({ error: 'Unauthorized.' }, 401) };
    const user = await uRes.json();
    if (!user || !UUID_RE.test(user.id || '')) return { error: json({ error: 'Unauthorized.' }, 401) };
    return { user, token };
}

async function authorizeInstitute(request, instituteId, roles) {
    if (!UUID_RE.test(instituteId || '')) return { error: json({ error: 'Invalid institute_id.' }, 400) };
    const who = await authenticateUser(request);
    if (who.error) return who;
    const { user, token } = who;
    const mRes = await fetch(
        `${SUPABASE_URL}/rest/v1/institute_members?profile_id=eq.${user.id}&institute_id=eq.${instituteId}&select=role`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` } });
    const rows = mRes.ok ? await mRes.json() : [];
    const role = rows[0] && rows[0].role;
    if (!role || (roles || ['owner', 'teacher']).indexOf(role) === -1) return { error: json({ error: 'Forbidden.' }, 403) };
    return { user, role, token };
}

async function handleLogin(request) {
    let email, password;
    try {
        ({ email, password } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    if (!email || !password) {
        return json({ error: 'Email and password are required.' }, 400);
    }

    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        },
        body: JSON.stringify({ email, password })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
        return json({ error: authData.error_description || authData.msg || 'Invalid email or password.' }, 401);
    }

    const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${authData.user.id}&select=role`,
        {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${authData.access_token}`
            }
        }
    );

    const profiles = await profRes.json();
    const role = profiles[0]?.role;

    if (!role) return json({ error: 'Account not configured. Please contact support.' }, 403);
    if (role !== 'owner' && role !== 'teacher') return json({ error: 'Unrecognised account role. Please contact support.' }, 403);

    return json({
        access_token:  authData.access_token,
        refresh_token: authData.refresh_token,
        user:          { id: authData.user.id, email: authData.user.email },
        role
    });
}

async function handleVerify(request) {
    let userId, token;
    try {
        ({ userId, token } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    if (!userId || !token) return json({ error: 'Missing userId or token.' }, 400);

    const profRes = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
        {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!profRes.ok) return json({ error: 'Unable to verify session.' }, 401);

    const profiles = await profRes.json();
    const role = profiles[0]?.role;

    if (!role) return json({ error: 'Role not found.' }, 403);

    return json({ role });
}

// â”€â”€ Multi-Tenant Moodle Resolver â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TENANT_MOODLE_MAP = {
    // Default / Trial Tenant (Pitthugram Trial Institute)
    '65e4628a-a283-45a3-ab2d-84073977d4c4': {
        moodle_url: 'https://trial001.classes.institute',
        tenant_name: 'Pitthugram Trial'
    }
};

async function getTenantMoodleConfig(instituteId, env, userToken) {
    // 1. Check in-memory mapping
    if (instituteId && TENANT_MOODLE_MAP[instituteId]) {
        // env is only available per request, so the token is attached here, not at module load
        return Object.assign({}, TENANT_MOODLE_MAP[instituteId], { moodle_token: (env && env.MOODLE_TOKEN) || '' });
    }

    // 2. Check Supabase institutes / moodle_config table if configured
    if (instituteId) {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/moodle_config?institute_id=eq.${encodeURIComponent(instituteId)}&select=moodle_url,moodle_token,tenant_name&limit=1`,
                {
                    headers: {
                        // moodle_config is RLS-protected, so the anon key sees nothing. Prefer a server-side
                        // service key (Worker secret MOODLE_CONFIG_SERVICE_KEY, MoodleCred project) so teachers
                        // never need read access to moodle_token; otherwise use the caller's own session token.
                        'apikey': (env && env.MOODLE_CONFIG_SERVICE_KEY) || SUPABASE_KEY,
                        'Authorization': `Bearer ${(env && env.MOODLE_CONFIG_SERVICE_KEY) || userToken || SUPABASE_KEY}`
                    }
                }
            );
            if (res.ok) {
                const rows = await res.json();
                if (rows && rows[0] && rows[0].moodle_url && rows[0].moodle_token) {
                    return rows[0];
                }
            }
        } catch (e) {
            console.warn('Tenant Moodle DB query notice:', e);
        }
    }

    // 3. Fallback to default trial Moodle
    return {
        moodle_url: (env && env.MOODLE_URL) || 'https://trial001.classes.institute',
        moodle_token: (env && env.MOODLE_TOKEN) || '',
        tenant_name: 'Default Trial'
    };
}

async function handleMoodleConfig(request, env) {
    const u = new URL(request.url);
    const instituteId = u.searchParams.get('institute_id');
    const auth = await authorizeInstitute(request, instituteId);
    if (auth.error) return auth.error;
    const tenantConfig = await getTenantMoodleConfig(instituteId, env, auth.token);

    return json({
        configured:   true,
        institute_id: instituteId,
        moodle_url:   tenantConfig.moodle_url,
        // moodle_token withheld for security
        configured: !!tenantConfig.moodle_url
    });
}

async function handleMoodleCourses(request, env) {
    let instituteId = null;
    if (request.method === 'POST') {
        try {
            const b = await request.json();
            instituteId = b.institute_id || null;
        } catch {}
    } else {
        const u = new URL(request.url);
        instituteId = u.searchParams.get('institute_id');
    }

    const auth = await authorizeInstitute(request, instituteId);
    if (auth.error) return auth.error;
    const tenantConfig = await getTenantMoodleConfig(instituteId, env, auth.token);
    const moodleUrl = tenantConfig.moodle_url;
    const moodleToken = tenantConfig.moodle_token;

    let courses = [
        { id: 2, fullname: "Class 11 - NEET Biology", shortname: "BIO11" },
        { id: 3, fullname: "Class 12 - JEE Chemistry", shortname: "CHEM12" },
        { id: 4, fullname: "Class 11 - JEE Chemistry", shortname: "CHEM11" },
        { id: 5, fullname: "Class 11 - JEE Physics", shortname: "PHY11" },
        { id: 6, fullname: "Class 11 - JEE Mathematics", shortname: "MATH11" },
        { id: 7, fullname: "Class 12 - NEET Biology", shortname: "BIO12" },
        { id: 8, fullname: "Class 12 - JEE Physics", shortname: "PHY12" },
        { id: 9, fullname: "Class 12 - JEE Mathematics", shortname: "MATH12" }
    ];

    try {
        const res = await fetch(`${moodleUrl}/webservice/rest/server.php?wstoken=${moodleToken}&wsfunction=core_course_get_courses&moodlewsrestformat=json`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const filtered = data.filter(function(c) { return c.id !== 1; }).map(function(c) {
                    return {
                        id: c.id,
                        fullname: c.fullname,
                        shortname: c.shortname
                    };
                });
                if (filtered.length > 0) courses = filtered;
            }
        }
    } catch (e) {
        console.warn('Moodle courses API fetch error:', e);
    }

    return json({ courses: courses, moodle_url: moodleUrl, institute_id: instituteId });
}
// ── MCQ image presign (IDrive S3, SigV4 via Web Crypto) ─────────────────────
async function handleMcqPresign(request, env) {
    const who = await authenticateUser(request);
    if (who.error) return who.error;
    let files;
    try {
        ({ files } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }
    if (!Array.isArray(files) || !files.length) return json({ error: 'No files provided.' }, 400);
    if (files.length > 20) return json({ error: 'Too many files.' }, 400);
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        return json({ error: 'Storage not configured.' }, 500);
    }

    const signed = [];
    for (const f of files) {
        if (!f || !f.key) return json({ error: 'Each file needs a key.' }, 400);
        if (typeof f.key !== 'string' || f.key.length > 300 || f.key.startsWith('/') || f.key.split('/').indexOf('..') !== -1) {
            return json({ error: 'Invalid file key.' }, 400);
        }
        const putUrl = await presignPutUrl(env, f.key, 600);
        const getUrl = `${S3_ENDPOINT}/${S3_BUCKET}/${encodeS3Key(f.key)}`;
        signed.push({ key: f.key, putUrl, getUrl });
    }
    return json({ signed });
}

function encodeS3Key(key) {
    return key.split('/').map(encodeURIComponent).join('/');
}

async function presignPutUrl(env, key, expiresSeconds) {
    const region   = S3_REGION;
    const service  = 's3';
    const endpoint = S3_ENDPOINT;
    const host     = new URL(endpoint).host;
    const now      = new Date();
    const amzDate  = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const scope    = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalUri = `/${S3_BUCKET}/${encodeS3Key(key)}`;
    const signedHeaders = 'host';

    const params = {
        'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
        'X-Amz-Credential': `${env.S3_ACCESS_KEY_ID}/${scope}`,
        'X-Amz-Date': amzDate,
        'X-Amz-Expires': String(expiresSeconds),
        'X-Amz-SignedHeaders': signedHeaders
    };
    const canonicalQuery = Object.keys(params).sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');

    const canonicalHeaders = `host:${host}\n`;
    const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n');
    const signingKey = await sigV4Key(env.S3_SECRET_ACCESS_KEY, dateStamp, region, service);
    const signature  = await hmacHex(signingKey, stringToSign);

    return `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

// ── MCQ save (insert into questions table, mapping image targets) ────────────
async function handleMcqSave(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }
    const { subject, chapter, board, questions } = body;
    const cls         = body.class;
    const instituteId = body.institute_id || (Array.isArray(questions) && questions[0] && questions[0].institute_id);
    const teacherId   = body.teacher_id || (Array.isArray(questions) && questions[0] && questions[0].teacher_id) || null;
    if (!Array.isArray(questions) || !questions.length) return json({ error: 'No questions to save.' }, 400);
    if (!instituteId) return json({ error: 'Missing institute_id.' }, 400);
    if (questions.length > 200) return json({ error: 'Too many questions in one request.' }, 400);
    const auth = await authorizeInstitute(request, instituteId);
    if (auth.error) return auth.error;
    if (!env.SUPA_DB_SERVICE_KEY) return json({ error: 'Database not configured.' }, 500);

    const base = SAVE_DB_URL;
    const headers = {
        'Content-Type': 'application/json',
        'apikey': env.SUPA_DB_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPA_DB_SERVICE_KEY}`
    };

    let saved = 0;
    for (const q of questions) {
        const row = {
            institute_id:     instituteId,
            teacher_id:       teacherId,
            question_text:    q.question_text,
            option_a:         q.option_a || '',
            option_b:         q.option_b || '',
            option_c:         q.option_c || '',
            option_d:         q.option_d || '',
            correct_answer:   q.correct_answer || 'A',
            correct_option:   q.correct_answer || 'A',
            subject:          q.subject || subject,
            chapter:          q.chapter || chapter,
            class:            q.class   || cls,
            board:            (q.board !== undefined ? q.board : board) || '',
            topic:            q.topic || '',
            difficulty_level: q.difficulty_level || 'Intermediate',
            explanation:      q.explanation || '',
            question_type:    'MCQ',
            is_active:        true,
            source:           'manual'
        };

        // 1) Insert the question, get its id back
        const qRes = await fetch(`${base}/rest/v1/questions`, {
            method: 'POST',
            headers: { ...headers, 'Prefer': 'return=representation' },
            body: JSON.stringify(row)
        });
        if (!qRes.ok) {
            const txt = await qRes.text();
            return json({ error: 'Question insert failed: ' + txt, saved }, 500);
        }
        const inserted = await qRes.json();
        if (!inserted || !inserted[0] || !inserted[0].id) return json({ error: 'Question insert returned no row.', saved }, 502);
        const qid = inserted[0].id;

        // 2) Insert normalized option rows
        const optRows = ['a', 'b', 'c', 'd']
            .filter(l => row['option_' + l])
            .map(l => ({ question_id: qid, option_label: l.toUpperCase(), option_text: row['option_' + l] }));
        if (optRows.length) {
            await fetch(`${base}/rest/v1/options`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify(optRows)
            });
        }

        // 3) Insert image rows (caption = target: question / A / B / C / D)
        const imgs = (q.images || []).filter(im => im && im.key);
        if (imgs.length) {
            const imgRows = imgs.map((im, i) => ({
                question_id: qid,
                idrive_key:  im.key,
                idrive_url:  im.getUrl || null,
                caption:     im.target || 'question',
                order_index: i
            }));
            await fetch(`${base}/rest/v1/question_images`, {
                method: 'POST',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify(imgRows)
            });
        }
        saved++;
    }
    return json({ saved });
}

// ── SigV4 / crypto helpers (Web Crypto) ─────────────────────────────────────
function toHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function sha256Hex(str) {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}
async function hmacRaw(keyBytes, str) {
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(str)));
}
async function hmacHex(keyBytes, str) {
    return toHex(await hmacRaw(keyBytes, str));
}
async function sigV4Key(secret, dateStamp, region, service) {
    let k = new TextEncoder().encode('AWS4' + secret);
    k = await hmacRaw(k, dateStamp);
    k = await hmacRaw(k, region);
    k = await hmacRaw(k, service);
    k = await hmacRaw(k, 'aws4_request');
    return k;
}

async function handleMoodleSchedule(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request payload.' }, 400);
    }

    const { institute_id, email, courseid, name, timeopen, timeclose, timelimit, attempts, shuffleanswers, questions } = body;
    const auth = await authorizeInstitute(request, institute_id);
    if (auth.error) return auth.error;
    if (questions !== undefined && (!Array.isArray(questions) || questions.length > 500)) {
        return json({ error: 'Invalid questions list.' }, 400);
    }
    const tenantConfig = await getTenantMoodleConfig(institute_id, env, auth.token);
    const n8nWebhookUrl = (env && env.N8N_MOODLE_WEBHOOK) || 'https://awsn8n.pitthugram.com/webhook/moodle-tenant-sync';

    // 1. Dispatch through AWS n8n Multi-Tenant Orchestrator
    try {
        const n8nRes = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'schedule_quiz',
                institute_id: institute_id,
                email: email || (auth.user && auth.user.email) || '',
                courseid: courseid || 2,
                name: name || 'Scheduled Assessment',
                timeopen: timeopen || Math.floor(Date.now() / 1000),
                timeclose: timeclose || 0,
                timelimit: timelimit || 1800,
                attempts: attempts || 1,
                shuffleanswers: shuffleanswers !== undefined ? shuffleanswers : true,
                questions: questions || []
            })
        });

        if (n8nRes.ok) {
            const n8nData = await n8nRes.json();
            return json({
                status: 'success',
                institute_id: n8nData.institute_id || institute_id,
                tenant_name: n8nData.tenant_name || tenantConfig.tenant_name,
                moodle_url: n8nData.moodle_url || tenantConfig.moodle_url,
                quiz_id: n8nData.quiz_id,
                cm_id: n8nData.cm_id,
                quiz_url: n8nData.quiz_url,
                courseid: n8nData.courseid || courseid,
                questioncount: n8nData.questioncount || (questions && questions.length) || 0,
                message: n8nData.message || `Quiz scheduled successfully`
            });
        }
    } catch (e) {
        console.warn('n8n dispatch error, falling back to direct mode:', e);
    }

    // 2. Direct fallback (if n8n is offline): save to scheduled_quizzes and return
    try {
        const serviceKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
        const qIds = Array.isArray(questions) ? questions.map(function(q) { return q.id || q.questionid; }).filter(Boolean) : [];
        await fetch(QB_SUPABASE_URL + '/rest/v1/scheduled_quizzes', {
            method: 'POST',
            headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                institute_id: institute_id,
                teacher_wordpress_id: email || (auth.user && auth.user.email) || '',
                quiz_title: name || 'Scheduled Quiz',
                scheduled_date: new Date().toISOString().slice(0, 10),
                scheduled_time: '10:00:00',
                question_ids: qIds,
                status: 'pending'
            })
        });
    } catch (e) {
        console.warn('Schedule record notice:', e);
    }

    return json({
        status: 'success',
        institute_id: institute_id,
        moodle_url: tenantConfig.moodle_url,
        courseid: courseid,
        questioncount: (questions && questions.length) || 0,
        message: `Quiz scheduled successfully (${tenantConfig.moodle_url})`
    });
}
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

async function handleHubspotLead(request, env) {
    let data;
    try {
        data = await request.json();
    } catch {
        return json({ error: 'Invalid JSON payload.' }, 400);
    }

    const { email, firstname, lastname, phone, company, city, batch_size, exam_target } = data;
    if (!email) {
        return json({ error: 'Email address is required.' }, 400);
    }

    const hsToken = (env && env.HUBSPOT_TOKEN) || '';
    const hsHeaders = {
        'Authorization': 'Bearer ' + hsToken,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Create Contact
        const contactPayload = {
            properties: {
                email: email.trim(),
                firstname: (firstname || '').trim(),
                lastname: (lastname || '').trim(),
                phone: (phone || '').trim(),
                company: (company || '').trim()
            }
        };

        const contactResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify(contactPayload)
        });

        const contactData = await contactResp.json();
        const contactId = contactData.id;

        // 2. Create Company if provided
        let companyId = null;
        if (company) {
            const compPayload = {
                properties: {
                    name: company.trim(),
                    city: (city || 'India').trim(),
                    country: 'India'
                }
            };
            const compResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify(compPayload)
            });
            const compData = await compResp.json();
            companyId = compData.id;

            // Associate Contact to Company
            if (contactId && companyId) {
                await fetch('https://api.hubapi.com/crm/v4/objects/contacts/' + contactId + '/associations/default/companies/' + companyId, {
                    method: 'PUT',
                    headers: hsHeaders
                });
            }
        }

        // 3. Create Follow-up Task in HubSpot
        const taskPayload = {
            properties: {
                hs_task_subject: 'New Lead: ' + (firstname || '') + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                hs_task_body: 'Target Exam: ' + (exam_target || 'JEE / NEET') + ' | Batch Size: ' + (batch_size || 'N/A') + ' | Phone: ' + (phone || 'N/A') + '. Follow up to schedule LMS trial.',
                hs_task_status: 'NOT_STARTED',
                hs_task_priority: 'HIGH',
                hs_timestamp: String(Date.now())
            }
        };

        await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify(taskPayload)
        });

        return json({
            success: true,
            message: 'Lead registered in HubSpot CRM successfully.',
            contactId: contactId,
            companyId: companyId
        });
    } catch (err) {
        return json({ error: err.message || 'HubSpot sync error' }, 500);
    }
}
// â”€â”€ Server-Side Handlers for Trial & Scheduled Quizzes (Protects CRM & DB keys) â”€â”€
async function handleTrial(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
    }

    const { email, phone, firstname, lastname, company, exam_target, message } = body;
    if (!email || !phone || !firstname) {
        return json({ error: 'Missing required fields (email, phone, firstname)' }, 400);
    }

    const hsToken = (env && env.HUBSPOT_TOKEN) || '';
    const hsHeaders = {
        'Authorization': 'Bearer ' + hsToken,
        'Content-Type': 'application/json'
    };

    let contactId = null;
    let isExisting = false;

    // 1. HubSpot Contact lookup / creation
    try {
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify({
                filterGroups: [{
                    filters: [{
                        propertyName: 'email',
                        operator: 'EQ',
                        value: email.trim().toLowerCase()
                    }]
                }]
            })
        });
        const searchData = await searchRes.json();
        if (searchData.total > 0) {
            isExisting = true;
            contactId = searchData.results[0].id;
        }

        if (!isExisting) {
            // Create Contact
            const contactResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify({
                    properties: { email, firstname, lastname, phone, company }
                })
            });
            const contactData = await contactResp.json();
            contactId = contactData.id;

            // Associate Company
            if (company && contactId) {
                try {
                    const compResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                        method: 'POST',
                        headers: hsHeaders,
                        body: JSON.stringify({
                            properties: { name: company, country: 'India' }
                        })
                    });
                    const compData = await compResp.json();
                    if (compData.id) {
                        await fetch('https://api.hubapi.com/crm/v4/objects/contacts/' + contactId + '/associations/default/companies/' + compData.id, {
                            method: 'PUT',
                            headers: hsHeaders
                        });
                    }
                } catch (e) {
                    console.warn('Company association notice:', e);
                }
            }

            // Create Onboarding Task
            try {
                await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
                    method: 'POST',
                    headers: hsHeaders,
                    body: JSON.stringify({
                        properties: {
                            hs_task_subject: 'New LMS Trial: ' + firstname + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                            hs_task_body: 'Target Exam: ' + (exam_target || 'JEE / NEET') + ' | Phone: ' + phone + ' | Email: ' + email + '. Setup trial course and WhatsApp credentials.',
                            hs_task_status: 'NOT_STARTED',
                            hs_task_priority: 'HIGH',
                            hs_timestamp: String(Date.now())
                        }
                    })
                });
            } catch (e) {
                console.warn('Task notice:', e);
            }
        } else {
            // Reactivation Task
            try {
                await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
                    method: 'POST',
                    headers: hsHeaders,
                    body: JSON.stringify({
                        properties: {
                            hs_task_subject: 'Reactivation Request: ' + firstname + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                            hs_task_body: 'Existing contact requested trial reactivation. Phone: ' + phone + ' | Email: ' + email + '.',
                            hs_task_status: 'NOT_STARTED',
                            hs_task_priority: 'HIGH',
                            hs_timestamp: String(Date.now())
                        }
                    })
                });
            } catch (e) {
                console.warn('Reactivation task notice:', e);
            }
        }
    } catch (err) {
        console.error('HubSpot sync error:', err);
    }

    // 2. Dispatch WhatsApp confirmation via AiSensy Cloud API
    try {
        const rawPhone = phone.replace(/[^0-9]/g, '');
        const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;
        const AISENSY_KEY = (env && env.AISENSY_API_KEY) || '';

        fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: AISENSY_KEY,
                campaignName: 'pitthugram_welcome',
                destination: cleanPhone,
                userName: (firstname + ' ' + (lastname || '')).trim(),
                templateParams: [
                    firstname,
                    company || 'Coaching Institute',
                    'https://portal.classes.institute',
                    email,
                    'Pitthugram@2026'
                ]
            })
        }).catch(e => console.warn('AiSensy dispatch notice:', e));
    } catch (e) {
        console.warn('AiSensy error:', e);
    }

    return json({
        success: true,
        isExisting,
        message: isExisting
            ? 'Reactivation request registered. Our team will contact you on WhatsApp.'
            : '14-day free trial registered. Check your WhatsApp for access details.'
    });
}

async function handleScheduledQuizzes(request, env) {
    const cors = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    };
    const method = request.method;
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const serviceKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
    if (!serviceKey) return json({ error: 'Database not configured.' }, 500);
    const svc = { 'apikey': serviceKey, 'Authorization': 'Bearer ' + serviceKey };

    if (method === 'GET') {
        const url = new URL(request.url);
        const instituteId = url.searchParams.get('institute_id');
        const auth = await authorizeInstitute(request, instituteId);
        if (auth.error) return auth.error;
        // Only whitelisted query parameters are forwarded; the institute filter is always enforced.
        const order = url.searchParams.get('order') === 'created_at.asc' ? 'created_at.asc' : 'created_at.desc';
        const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 200);
        const res = await fetch(`${QB_SUPABASE_URL}/rest/v1/scheduled_quizzes?institute_id=eq.${instituteId}&order=${order}&limit=${limit}`, { headers: svc });
        return json(await res.json(), res.status);
    }

    if (method === 'POST') {
        let payload;
        try { payload = await request.json(); } catch { return json({ error: 'Invalid payload' }, 400); }
        const auth = await authorizeInstitute(request, payload && payload.institute_id);
        if (auth.error) return auth.error;
        const allowed = ['institute_id', 'centre_id', 'teacher_wordpress_id', 'quiz_title', 'scheduled_date', 'scheduled_time', 'question_ids', 'status', 'moodle_quiz_id', 'error_message', 'class'];
        const row = {};
        allowed.forEach(function (k) { if (payload[k] !== undefined) row[k] = payload[k]; });
        const res = await fetch(`${QB_SUPABASE_URL}/rest/v1/scheduled_quizzes`, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, svc),
            body: JSON.stringify(row)
        });
        return json(await res.json(), res.status);
    }

    return new Response('Method Not Allowed', { status: 405 });
}

// ── Question-level analysis (feeds analysis.js in reports.html) ───────────────
// GET /api/question-analysis?institute_id=<uuid>&test_id=<id>[&correct_marks=4&negative_marks=1]
// Auth: caller's Supabase session token, and the caller must be owner/teacher of institute_id.
// Reads student_attempts + students (Onboarding project, service key) and question tags (question bank).
export function buildAnalysisPayload(attempts, students, tags, opts) {
    opts = opts || {};
    const correctMarks = Number(opts.correctMarks != null ? opts.correctMarks : 1);
    const negMarks = Number(opts.negativeMarks != null ? opts.negativeMarks : 0);
    const nameOf = {};
    const rollOf = {};
    (students || []).forEach(function (st) {
        nameOf[st.id] = st.full_name || st.name || st.email || String(st.id);
        rollOf[st.id] = st.roll_number || st.idnumber || st.username || ('ID-' + st.id);
    });
    const tagOf = {};
    (tags || []).forEach(function (q) { tagOf[q.id] = q; });
    const seen = {};
    const results = (attempts || []).map(function (a) {
        seen[a.question_id] = true;
        const skipped = a.selected_answer == null || a.selected_answer === '';
        const status = skipped ? 'skipped' : (a.is_correct ? 'correct' : 'wrong');
        return {
            student_id: a.student_id,
            roll_number: rollOf[a.student_id] || ('ID-' + a.student_id),
            student_name: nameOf[a.student_id] || String(a.student_id),
            question_id: a.question_id,
            status: status,
            marks: status === 'correct' ? correctMarks : (status === 'wrong' ? -negMarks : 0),
            time_seconds: a.time_taken_sec != null ? Number(a.time_taken_sec) : null
        };
    });
    const questions = Object.keys(seen).map(function (id) {
        const q = tagOf[id] || {};
        return {
            id: id,
            subject: q.subject || 'Untagged',
            chapter: q.chapter || 'Untagged',
            topic: q.topic || '',
            difficulty: q.difficulty_level || q.difficulty || 'Unspecified',
            max_marks: correctMarks,
            neg_marks: negMarks
        };
    });
    return { questions: questions, question_results: results };
}

async function handleQuestionAnalysis(request, env) {
    const u = new URL(request.url);
    const instituteId = u.searchParams.get('institute_id') || '';
    const testId = u.searchParams.get('test_id') || '';
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(instituteId)) return json({ error: 'Invalid institute_id.' }, 400);
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(testId)) return json({ error: 'Invalid test_id.' }, 400);

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return json({ error: 'Unauthorized.' }, 401);
    if (!env.SUPA_DB_SERVICE_KEY) return json({ error: 'Database not configured.' }, 500);

    // 1) Who is calling? (token is validated by Supabase Auth, not just checked for presence)
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` } });
    if (!userRes.ok) return json({ error: 'Unauthorized.' }, 401);
    const user = await userRes.json();
    if (!user || !uuid.test(user.id || '')) return json({ error: 'Unauthorized.' }, 401);

    // 2) Must be owner/teacher of this institute (RLS applies, the query uses the caller's token)
    const memRes = await fetch(
        `${SUPABASE_URL}/rest/v1/institute_members?profile_id=eq.${user.id}&institute_id=eq.${instituteId}&select=role`,
        { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` } }
    );
    const members = memRes.ok ? await memRes.json() : [];
    const role = members[0] && members[0].role;
    if (role !== 'owner' && role !== 'teacher') return json({ error: 'Forbidden.' }, 403);

    // 3) Attempts and students for this institute + test (service key, always filtered by institute_id)
    const svc = { 'apikey': env.SUPA_DB_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPA_DB_SERVICE_KEY}` };
    const aRes = await fetch(
        `${SAVE_DB_URL}/rest/v1/student_attempts?institute_id=eq.${instituteId}&test_id=eq.${encodeURIComponent(testId)}&select=student_id,question_id,selected_answer,is_correct,time_taken_sec&limit=20000`,
        { headers: svc }
    );
    if (!aRes.ok) return json({ error: 'Could not load attempts.' }, 502);
    const attempts = await aRes.json();
    if (!attempts.length) {
        // No stored attempts yet: read per-question results straight from Moodle for this institute.
        try {
            const cfg = await getTenantMoodleConfig(instituteId, env, token);
            if (!cfg || !cfg.moodle_url || !cfg.moodle_token) return json({ questions: [], question_results: [], note: 'Assessment engine is not configured for this institute.' });
            const loaded = await loadMoodleRows(cfg, testId);
            if (!loaded.rows.length) return json({ questions: [], question_results: [], note: loaded.note || 'No finished attempts yet.' });
            const qbKey2 = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
            const tagMap = await lookupTags(loaded.rows.map(function (r) { return r.key; }), async function (pattern) {
                const r = await fetch(`${QB_SUPABASE_URL}/rest/v1/questions?question_text=ilike.${encodeURIComponent(pattern)}&select=id,question_text,subject,chapter,difficulty_level&limit=5`,
                    { headers: { 'apikey': qbKey2, 'Authorization': `Bearer ${qbKey2}` } });
                return r.ok ? r.json() : [];
            });
            return json(buildMoodlePayload(loaded.rows, tagMap));
        } catch (e) {
            return json({ questions: [], question_results: [], note: 'Could not read test results: ' + (e && e.message || 'error') });
        }
    }

    const studentIds = Array.from(new Set(attempts.map(function (a) { return a.student_id; }))).filter(function (id) { return uuid.test(String(id)); });
    const sRes = studentIds.length ? await fetch(
        `${SAVE_DB_URL}/rest/v1/students?institute_id=eq.${instituteId}&id=in.(${studentIds.join(',')})&select=*`,
        { headers: svc }
    ) : null;
    const students = sRes && sRes.ok ? await sRes.json() : [];

    // 4) Subject/chapter/difficulty tags from the question bank
    const qIds = Array.from(new Set(attempts.map(function (a) { return a.question_id; }))).filter(function (id) { return uuid.test(String(id)); });
    const qbKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
    let tags = [];
    for (let i = 0; i < qIds.length; i += 100) {
        const chunk = qIds.slice(i, i + 100);
        const tRes = await fetch(
            `${QB_SUPABASE_URL}/rest/v1/questions?id=in.(${chunk.join(',')})&select=id,subject,chapter,difficulty_level`,
            { headers: { 'apikey': qbKey, 'Authorization': `Bearer ${qbKey}` } }
        );
        if (tRes.ok) tags = tags.concat(await tRes.json());
    }

    return json(buildAnalysisPayload(attempts, students, tags, {
        correctMarks: u.searchParams.get('correct_marks'),
        negativeMarks: u.searchParams.get('negative_marks')
    }));
}


// ── Question bank read for teachers (keeps correct_answer off the public key) ──
// GET /api/question-bank?institute_id=<uuid>[&class=&board=&subject=&chapter=&difficulty=&limit=]
// Owner/teacher of institute_id only. Only whitelisted filters and columns are used.
const QB_COLUMNS = 'id,question_text,option_a,option_b,option_c,option_d,correct_answer,explanation,difficulty_level,chapter,class,subject,board,question_type,question_image,option_a_image,option_b_image,option_c_image,option_d_image';
async function handleQuestionBank(request, env) {
    const u = new URL(request.url);
    const auth = await authorizeInstitute(request, u.searchParams.get('institute_id'));
    if (auth.error) return auth.error;
    const serviceKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
    if (!serviceKey) return json({ error: 'Database not configured.' }, 500);

    const clean = function (v) { return String(v || '').replace(/[*,()]/g, '').slice(0, 120); };
    let q = `${QB_SUPABASE_URL}/rest/v1/questions?is_active=eq.true&select=${QB_COLUMNS}&order=class,subject,chapter,difficulty_level`;
    ['class', 'board', 'subject'].forEach(function (k) {
        const v = clean(u.searchParams.get(k));
        if (v) q += `&${k}=eq.${encodeURIComponent(v)}`;
    });
    const diff = clean(u.searchParams.get('difficulty'));
    if (diff) q += `&difficulty_level=eq.${encodeURIComponent(diff)}`;
    const chapter = clean(u.searchParams.get('chapter'));
    if (chapter) q += `&chapter=ilike.*${encodeURIComponent(chapter)}`;
    const limit = Math.min(Math.max(parseInt(u.searchParams.get('limit') || '500', 10) || 500, 1), 1000);
    q += `&limit=${limit}`;

    const res = await fetch(q, { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } });
    return json(await res.json(), res.status);
}

// DELETE /api/question-bank?id=<uuid>&institute_id=<uuid>[&hard=true]
// or DELETE/POST /api/question-delete with query params or JSON body { id/question_id, institute_id, hard }
// Owner/teacher of institute_id only. Multi-tenant check: can only delete question if question belongs to institute_id or added_by user/institute.
async function handleQuestionDelete(request, env) {
    const u = new URL(request.url);
    let questionId = u.searchParams.get('id') || u.searchParams.get('question_id') || '';
    let instituteId = u.searchParams.get('institute_id') || '';
    let hard = u.searchParams.get('hard') === 'true';

    if (request.method === 'POST' || (request.headers.get('content-type') || '').includes('application/json')) {
        try {
            const body = await request.clone().json();
            if (body && typeof body === 'object') {
                if (!questionId) questionId = body.id || body.question_id || '';
                if (!instituteId) instituteId = body.institute_id || '';
                if (body.hard !== undefined) hard = Boolean(body.hard);
            }
        } catch (_) {}
    }

    if (!UUID_RE.test(instituteId)) return json({ error: 'Invalid or missing institute_id.' }, 400);
    if (!UUID_RE.test(questionId)) return json({ error: 'Invalid or missing question id.' }, 400);

    const auth = await authorizeInstitute(request, instituteId, ['owner', 'teacher']);
    if (auth.error) return auth.error;

    const serviceKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
    const supaDbKey  = (env && env.SUPA_DB_SERVICE_KEY) || serviceKey;
    if (!serviceKey && !supaDbKey) return json({ error: 'Database not configured.' }, 500);

    // Locate question in DB (checking QB_SUPABASE_URL and SAVE_DB_URL)
    const targets = [
        { url: QB_SUPABASE_URL, key: serviceKey },
        ...(SAVE_DB_URL && SAVE_DB_URL !== QB_SUPABASE_URL ? [{ url: SAVE_DB_URL, key: supaDbKey }] : [])
    ];

    let foundTarget = null;
    let questionRow = null;

    for (const t of targets) {
        if (!t.key) continue;
        try {
            const checkRes = await fetch(`${t.url}/rest/v1/questions?id=eq.${questionId}&select=id,is_active,institute_id,added_by`, {
                headers: { 'apikey': t.key, 'Authorization': `Bearer ${t.key}` }
            });
            if (checkRes.ok) {
                const rows = await checkRes.json();
                if (Array.isArray(rows) && rows.length > 0) {
                    foundTarget = t;
                    questionRow = rows[0];
                    break;
                }
            }
        } catch (_) {}
    }

    if (!questionRow) {
        return json({ error: 'Question not found.' }, 404);
    }

    // Multi-tenant check:
    // If the question has an institute_id, it must match the caller's institute_id.
    if (questionRow.institute_id && questionRow.institute_id !== instituteId) {
        return json({ error: 'Forbidden: question belongs to another institute.' }, 403);
    }

    // If the question has no institute_id, check added_by. If added_by is system/gemini-auto or empty, it's central curriculum.
    if (!questionRow.institute_id) {
        const addedBy = String(questionRow.added_by || '').trim();
        const callerUserId = auth.user ? auth.user.id : '';
        const isOwnerCreator = addedBy && (addedBy === callerUserId || addedBy === instituteId);
        if (!isOwnerCreator) {
            return json({ error: 'Forbidden: central curriculum questions cannot be deleted.' }, 403);
        }
    }

    // Execute deletion (soft-delete by default, or hard delete if requested)
    const delHeaders = {
        'apikey': foundTarget.key,
        'Authorization': `Bearer ${foundTarget.key}`,
        'Content-Type': 'application/json'
    };

    let delRes;
    if (hard) {
        delRes = await fetch(`${foundTarget.url}/rest/v1/questions?id=eq.${questionId}`, {
            method: 'DELETE',
            headers: { ...delHeaders, 'Prefer': 'return=representation' }
        });
    } else {
        delRes = await fetch(`${foundTarget.url}/rest/v1/questions?id=eq.${questionId}`, {
            method: 'PATCH',
            headers: { ...delHeaders, 'Prefer': 'return=representation' },
            body: JSON.stringify({ is_active: false })
        });
    }

    if (!delRes.ok) {
        const errText = await delRes.text();
        return json({ error: 'Failed to delete question from database: ' + errText }, 502);
    }

    return json({
        success: true,
        id: questionId,
        hard: hard,
        message: hard ? 'Question permanently deleted.' : 'Question removed from question bank.'
    }, 200);
}


// ── Per-question results straight from Moodle (used when student_attempts has no rows) ──
async function moodleCall(cfg, fn, params) {
    const body = new URLSearchParams({ wstoken: cfg.moodle_token, wsfunction: fn, moodlewsrestformat: 'json' });
    Object.keys(params || {}).forEach(function (k) {
        const v = params[k];
        if (Array.isArray(v)) v.forEach(function (x, i) { body.append(`${k}[${i}]`, x); });
        else body.append(k, v);
    });
    const r = await fetch(String(cfg.moodle_url).replace(/\/$/, '') + '/webservice/rest/server.php', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body
    });
    const d = await r.json();
    if (d && d.exception) throw new Error(d.message || d.errorcode || 'Moodle error');
    return d;
}

export function normText(html) {
    return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#\d+;/g, ' ')
        .toLowerCase().replace(/[^a-z0-9ऀ-ॿ]+/g, ' ').trim();
}
function qtextOf(html) {
    const m = /<div class="qtext">([\s\S]*?)<\/div>\s*(?:<div class="ablock|<\/div>|$)/.exec(String(html || ''));
    return normText(m ? m[1] : html);
}
function moodleStatus(st) {
    st = String(st || '').toLowerCase();
    if (st === 'gradedright' || st === 'correct') return 'correct';
    if (st === 'gradedwrong' || st === 'gradedpartial' || st === 'partiallycorrect' || st === 'incorrect') return 'wrong';
    return 'skipped'; // gaveup, todo, invalid, notanswered...
}

export async function loadMoodleRows(cfg, quizRef) {
    const courses = await moodleCall(cfg, 'core_course_get_courses', {});
    const ids = (courses || []).map(function (c) { return c.id; }).filter(function (id) { return id !== 1; });
    if (!ids.length) return { rows: [], note: 'no courses' };
    const qz = await moodleCall(cfg, 'mod_quiz_get_quizzes_by_courses', { courseids: ids });
    const quiz = ((qz && qz.quizzes) || []).find(function (q) { return String(q.id) === String(quizRef) || String(q.coursemodule) === String(quizRef); });
    if (!quiz) return { rows: [], note: 'quiz not found' };
    const users = (await moodleCall(cfg, 'core_enrol_get_enrolled_users', { courseid: quiz.course })) || [];
    const rows = [];
    const todo = users.slice(0, 200);
    for (let i = 0; i < todo.length; i += 8) {
        await Promise.all(todo.slice(i, i + 8).map(async function (u) {
            let list;
            try { list = await moodleCall(cfg, 'mod_quiz_get_user_attempts', { quizid: quiz.id, userid: u.id, status: 'finished', includepreviews: 0 }); }
            catch (e) { return; }
            const attempts = (list && list.attempts) || [];
            if (!attempts.length) return;
            const best = attempts[attempts.length - 1]; // latest finished attempt
            let rev;
            try { rev = await moodleCall(cfg, 'mod_quiz_get_attempt_review', { attemptid: best.id }); } catch (e) { return; }
            ((rev && rev.questions) || []).forEach(function (q) {
                rows.push({
                    student_id: String(u.id), student_name: u.fullname || ('User ' + u.id),
                    key: qtextOf(q.html), status: moodleStatus(q.status),
                    marks: Number(q.mark || 0), maxmark: Number(q.maxmark || 1)
                });
            });
        }));
    }
    return { rows, quiz: { id: quiz.id, name: quiz.name } };
}

// Match Moodle question text to the question bank to get subject / chapter / difficulty.
export async function lookupTags(keys, fetchRows) {
    const out = {};
    const uniq = Array.from(new Set(keys)).filter(Boolean);
    for (let i = 0; i < uniq.length; i += 8) {
        await Promise.all(uniq.slice(i, i + 8).map(async function (k) {
            const words = k.split(' ').filter(function (w) { return w.length > 1; }).slice(0, 8).map(function (w) { return w.replace(/[*,()%_]/g, ''); });
            if (words.length < 3) return;
            const found = await fetchRows('*' + words.join('*') + '*');
            const hit = (found || []).find(function (r) { return normText(r.question_text).indexOf(k.slice(0, 60)) === 0; });
            if (hit) out[k] = hit;
        }));
    }
    return out;
}

export function buildMoodlePayload(rows, tags) {
    const qMeta = {};
    const results = rows.map(function (r) {
        const t = tags[r.key] || {};
        const qid = t.id || ('moodle:' + r.key.slice(0, 40));
        qMeta[qid] = {
            id: qid, subject: t.subject || 'Untagged', chapter: t.chapter || 'Untagged', topic: t.topic || '',
            difficulty: t.difficulty_level || 'Unspecified', max_marks: r.maxmark, neg_marks: 0
        };
        return { student_id: r.student_id, student_name: r.student_name, question_id: qid, status: r.status, marks: r.marks, time_seconds: null };
    });
    return { questions: Object.keys(qMeta).map(function (k) { return qMeta[k]; }), question_results: results, source: 'moodle' };
}
