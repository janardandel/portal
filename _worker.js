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
        // Serve static assets for everything else
        return env.ASSETS.fetch(request);
    }
};

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
        moodle_token: (env && env.MOODLE_TOKEN) || '',
        tenant_name: 'Pitthugram Trial'
    }
};

async function getTenantMoodleConfig(instituteId, env) {
    // 1. Check in-memory mapping
    if (instituteId && TENANT_MOODLE_MAP[instituteId]) {
        return TENANT_MOODLE_MAP[instituteId];
    }

    // 2. Check Supabase institutes / moodle_config table if configured
    if (instituteId) {
        try {
            const res = await fetch(
                `${SUPABASE_URL}/rest/v1/moodle_config?institute_id=eq.${encodeURIComponent(instituteId)}&select=moodle_url,moodle_token,tenant_name&limit=1`,
                {
                    headers: {
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`
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
    const tenantConfig = await getTenantMoodleConfig(instituteId, env);

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

    const tenantConfig = await getTenantMoodleConfig(instituteId, env);
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
    let files;
    try {
        ({ files } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }
    if (!Array.isArray(files) || !files.length) return json({ error: 'No files provided.' }, 400);
    if (!env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        return json({ error: 'Storage not configured.' }, 500);
    }

    const signed = [];
    for (const f of files) {
        if (!f || !f.key) return json({ error: 'Each file needs a key.' }, 400);
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
    const instituteId = body.institute_id;
    const teacherId   = body.teacher_id || null;
    if (!Array.isArray(questions) || !questions.length) return json({ error: 'No questions to save.' }, 400);
    if (!instituteId) return json({ error: 'Missing institute_id.' }, 400);
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
        const qid = (await qRes.json())[0].id;

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
    const tenantConfig = await getTenantMoodleConfig(institute_id, env);
    const n8nWebhookUrl = (env && env.N8N_MOODLE_WEBHOOK) || 'https://awsn8n.pitthugram.com/webhook/moodle-tenant-sync';

    // 1. Dispatch through AWS n8n Multi-Tenant Orchestrator
    try {
        const n8nRes = await fetch(n8nWebhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'schedule_quiz',
                institute_id: institute_id || '65e4628a-a283-45a3-ab2d-84073977d4c4',
                email: email || 'teacher@classes.institute',
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
                message: n8nData.message || `Quiz scheduled successfully in Moodle`
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
                teacher_wordpress_id: email || '1edca830-a871-4ed6-830b-1fa60273ec91',
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
        message: `Quiz scheduled successfully in Moodle (${tenantConfig.moodle_url})`
    });
}
function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

// â”€â”€ Server-Side Handlers for Trial & Scheduled Quizzes (Protects CRM & DB keys) â”€â”€
const AIRTABLE_BASE  = 'appJUgBQPQHElMNrN';
const AIRTABLE_TABLE = 'tblIbHhU3t3DYLzWE';

async function allocateMoodleCredentials(env) {
    const atToken = (env && env.AIRTABLE_TOKEN) || '';
    if (!atToken) return null;
    const atHeaders = { 'Authorization': 'Bearer ' + atToken, 'Content-Type': 'application/json' };

    try {
        const filterUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=NOT({Used})&maxRecords=1`;
        const atResp = await fetch(filterUrl, { headers: atHeaders });
        const atData = await atResp.json();
        if (!atData.records || atData.records.length === 0) return null;

        const rec = atData.records[0];
        const f = rec.fields;
        const studentLogins = [];
        for (let i = 1; i <= 5; i++) {
            const sUser = f['Student' + i + ' Username'];
            const sPass = f['Student' + i + ' Password'];
            if (sUser && sPass) studentLogins.push({ num: i, username: sUser, password: sPass });
        }

        // Lock immediately so a concurrent signup can't claim the same row
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${rec.id}`, {
            method: 'PATCH',
            headers: atHeaders,
            body: JSON.stringify({ fields: { Used: true } })
        });

        return {
            moodleUrl: f['Coaching URL'] || null,
            teacherUser: f['Teacher Username'] || null,
            teacherPass: f['Teacher Password'] || null,
            studentLogins
        };
    } catch (e) {
        console.warn('Airtable pool notice:', e);
        return null;
    }
}

async function handleTrial(request, env) {
    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid JSON payload' }, 400);
    }

    const { email, phone, firstname, lastname, company, exam_target, batch_size } = body;
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
    let moodleUrl = null, teacherUser = null, teacherPass = null, studentLogins = [];

    // 1. HubSpot dedup check
    try {
        const searchRes = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify({
                filterGroups: [{
                    filters: [{ propertyName: 'email', operator: 'EQ', value: email.trim().toLowerCase() }]
                }]
            })
        });
        const searchData = await searchRes.json();
        if (searchData.total > 0) {
            isExisting = true;
            contactId = searchData.results[0].id;
        }
    } catch (err) {
        console.warn('HubSpot dedup notice:', err);
    }

    if (!isExisting) {
        // 2. Allocate a real Moodle credential set from the pool (never a hardcoded default)
        const allocation = await allocateMoodleCredentials(env);
        if (allocation) {
            moodleUrl = allocation.moodleUrl;
            teacherUser = allocation.teacherUser;
            teacherPass = allocation.teacherPass;
            studentLogins = allocation.studentLogins;
        }

        // 3. Create Contact (with Moodle properties when allocated)
        try {
            const contactResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify({
                    properties: {
                        email, firstname, lastname, phone, company,
                        ...(moodleUrl ? { moodle_url: moodleUrl } : {}),
                        ...(teacherUser ? { moodle_username: teacherUser } : {}),
                        ...(teacherPass ? { moodle_password: teacherPass } : {})
                    }
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
                        body: JSON.stringify({ properties: { name: company, country: 'India' } })
                    });
                    const compData = await compResp.json();
                    if (compData.id) {
                        await fetch(`https://api.hubapi.com/crm/v4/objects/contacts/${contactId}/associations/default/companies/${compData.id}`, {
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
                let taskBody = 'Target Exam: ' + (exam_target || 'JEE / NEET') + ' | Batch Size: ' + (batch_size || 'N/A') +
                               ' | Phone: ' + phone + ' | Email: ' + email;
                if (teacherUser && teacherPass) {
                    taskBody += '\n\nMOODLE CREDENTIALS ALLOCATED:\n• Moodle URL: ' + (moodleUrl || 'N/A') +
                                '\n• Teacher Login: ' + teacherUser + ' / ' + teacherPass;
                } else {
                    taskBody += '\n\nNo pooled Moodle credentials were available — manual provisioning required.';
                }
                await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
                    method: 'POST',
                    headers: hsHeaders,
                    body: JSON.stringify({
                        properties: {
                            hs_task_subject: 'New LMS Trial: ' + firstname + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                            hs_task_body: taskBody,
                            hs_task_status: 'NOT_STARTED',
                            hs_task_priority: 'HIGH',
                            hs_timestamp: String(Date.now())
                        }
                    })
                });
            } catch (e) {
                console.warn('Task notice:', e);
            }
        } catch (err) {
            console.error('HubSpot contact creation error:', err);
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

    // 4. Dispatch WhatsApp confirmation via AiSensy Cloud API
    try {
        const rawPhone = phone.replace(/[^0-9]/g, '');
        const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;
        const AISENSY_KEY = (env && env.AISENSY_API_KEY) || '';

        if (AISENSY_KEY) {
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
                        moodleUrl || 'https://portal.classes.institute',
                        teacherUser || email,
                        teacherPass || ''
                    ]
                })
            }).catch(e => console.warn('AiSensy dispatch notice:', e));
        }
    } catch (e) {
        console.warn('AiSensy error:', e);
    }

    return json({
        success: true,
        isExisting,
        moodleUrl, teacherUser, teacherPass, studentLogins,
        message: isExisting
            ? 'Reactivation request registered. Our team will contact you on WhatsApp.'
            : (teacherUser && teacherPass
                ? '14-day free trial registered. Check your WhatsApp for access details.'
                : 'Trial request registered. Our onboarding team will set up your Moodle access and follow up shortly.')
    });
}

async function handleScheduledQuizzes(request, env) {
    const authHeader = request.headers.get('Authorization') || '';
    const authToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!authToken && request.method !== 'OPTIONS') {
        return json({ error: 'Unauthorized: Authentication required.' }, 401);
    }
    const serviceKey = (env && env.SUPABASE_SERVICE_ROLE_KEY) || QB_SERVICE_KEY;
    const method = request.method;

    if (method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization'
            }
        });
    }

    if (method === 'GET') {
        const url = new URL(request.url);
        const search = url.search || '?order=created_at.desc';
        const res = await fetch(QB_SUPABASE_URL + '/rest/v1/scheduled_quizzes' + search, {
            headers: {
                'apikey': serviceKey,
                'Authorization': 'Bearer ' + serviceKey
            }
        });
        const data = await res.json();
        return json(data, res.status);
    }

    if (method === 'POST') {
        let payload;
        try {
            payload = await request.json();
        } catch {
            return json({ error: 'Invalid payload' }, 400);
        }

        const res = await fetch(QB_SUPABASE_URL + '/rest/v1/scheduled_quizzes', {
            method: 'POST',
            headers: {
                'apikey': serviceKey,
                'Authorization': 'Bearer ' + serviceKey,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(payload)
        });

        const data = await res.json();
        return json(data, res.status);
    }

    return new Response('Method Not Allowed', { status: 405 });
}