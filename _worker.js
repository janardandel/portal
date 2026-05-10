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

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
