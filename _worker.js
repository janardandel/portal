const SUPABASE_URL = 'https://lekvzyoarawotlsbeoqa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3Z6eW9hcmF3b3Rsc2Jlb3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTgzNTIsImV4cCI6MjA5Mzg3NDM1Mn0.KO-UyQerUdbxxhqBDX5F51ZMU2WGIi6BLg-b-rDALmk';

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
        if (path === '/api/moodle-config') {
            if (method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
            return handleMoodleConfig(request);
        }
        if (path === '/api/mcq-presign') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleMcqPresign(request, env);
        }
        if (path === '/api/mcq-save') {
            if (method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
            return handleMcqSave(request, env);
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

async function handleMoodleConfig(request) {
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) return json({ error: 'Unauthorized.' }, 401);

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/moodle_config?id=eq.1&select=moodle_url,moodle_token`,
        {
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!res.ok) return json({ error: 'Unable to fetch Moodle configuration.' }, 401);

    const rows = await res.json();
    if (!rows || !rows[0] || !rows[0].moodle_url || !rows[0].moodle_token) {
        return json({ configured: false });
    }

    return json({
        configured:   true,
        moodle_url:   rows[0].moodle_url,
        moodle_token: rows[0].moodle_token
    });
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
    if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
        return json({ error: 'Storage not configured.' }, 500);
    }

    const signed = [];
    for (const f of files) {
        if (!f || !f.key) return json({ error: 'Each file needs a key.' }, 400);
        const putUrl = await presignPutUrl(env, f.key, 600);
        const getUrl = `${env.S3_ENDPOINT.replace(/\/$/, '')}/${env.S3_BUCKET}/${encodeS3Key(f.key)}`;
        signed.push({ key: f.key, putUrl, getUrl });
    }
    return json({ signed });
}

function encodeS3Key(key) {
    return key.split('/').map(encodeURIComponent).join('/');
}

async function presignPutUrl(env, key, expiresSeconds) {
    const region   = env.S3_REGION || 'us-east-1';
    const service  = 's3';
    const endpoint = env.S3_ENDPOINT.replace(/\/$/, '');
    const host     = new URL(endpoint).host;
    const now      = new Date();
    const amzDate  = now.toISOString().replace(/[:-]|\.\d{3}/g, '');   // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8);
    const scope    = `${dateStamp}/${region}/${service}/aws4_request`;
    const canonicalUri = `/${env.S3_BUCKET}/${encodeS3Key(key)}`;
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
    const cls     = body.class;
    const addedBy = body.added_by || body.institute_id || '';
    if (!Array.isArray(questions) || !questions.length) return json({ error: 'No questions to save.' }, 400);
    if (!env.SUPA_DB_URL || !env.SUPA_DB_SERVICE_KEY) return json({ error: 'Database not configured.' }, 500);

    const imgUrl = (imgs, t) => {
        const m = (imgs || []).find(im => (im.target || 'question') === t);
        return m ? (m.getUrl || null) : null;
    };

    const rows = questions.map(q => ({
        question_text:    q.question_text,
        option_a:         q.option_a || '',
        option_b:         q.option_b || '',
        option_c:         q.option_c || '',
        option_d:         q.option_d || '',
        correct_answer:   q.correct_answer || 'A',
        subject:          q.subject  || subject,
        chapter:          q.chapter  || chapter,
        class:            q.class    || cls,
        board:            (q.board !== undefined ? q.board : board) || '',
        difficulty_level: q.difficulty_level || 'Intermediate',
        explanation:      q.explanation || '',
        question_type:    'MCQ',
        is_active:        true,
        added_by:         addedBy,
        question_image:   imgUrl(q.images, 'question'),
        option_a_image:   imgUrl(q.images, 'A'),
        option_b_image:   imgUrl(q.images, 'B'),
        option_c_image:   imgUrl(q.images, 'C'),
        option_d_image:   imgUrl(q.images, 'D')
    }));

    const res = await fetch(`${env.SUPA_DB_URL.replace(/\/$/, '')}/rest/v1/questions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPA_DB_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPA_DB_SERVICE_KEY}`,
            'Prefer': 'return=minimal'
        },
        body: JSON.stringify(rows)
    });
    if (!res.ok) {
        const txt = await res.text();
        return json({ error: 'Save failed: ' + txt }, 500);
    }
    return json({ saved: rows.length });
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

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
