/**
 * POST /api/login
 * Body: { email, password }
 * Returns: { access_token, refresh_token, user: { id, email }, role }
 *
 * Supabase URL and key are read from Cloudflare Pages secrets —
 * they are never exposed to the browser.
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
        return json({ error: 'Server misconfiguration. Contact support.' }, 500);
    }

    let email, password;
    try {
        ({ email, password } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    if (!email || !password) {
        return json({ error: 'Email and password are required.' }, 400);
    }

    // Step 1 — Supabase authentication
    const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_KEY}`
        },
        body: JSON.stringify({ email, password })
    });

    const authData = await authRes.json();
    if (!authRes.ok) {
        return json({
            error: authData.error_description || authData.msg || 'Invalid email or password.'
        }, 401);
    }

    // Step 2 — Fetch role from profiles table
    const profRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${authData.user.id}&select=role`,
        {
            headers: {
                'apikey': env.SUPABASE_KEY,
                'Authorization': `Bearer ${authData.access_token}`
            }
        }
    );

    const profiles = await profRes.json();
    const role = profiles[0]?.role;

    if (!role) {
        return json({ error: 'Account not configured. Please contact support.' }, 403);
    }
    if (role !== 'owner' && role !== 'teacher') {
        return json({ error: 'Unrecognised account role. Please contact support.' }, 403);
    }

    return json({
        access_token:  authData.access_token,
        refresh_token: authData.refresh_token,
        user:          { id: authData.user.id, email: authData.user.email },
        role
    });
}

export function onRequestGet() {
    return new Response('Method Not Allowed', { status: 405 });
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
