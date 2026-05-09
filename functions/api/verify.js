/**
 * POST /api/verify
 * Body: { userId, token }
 * Returns: { role }
 *
 * Called by owner-dashboard on every load to confirm the session
 * user is still an owner according to Supabase.
 */
export async function onRequestPost(context) {
    const { request, env } = context;

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
        return json({ error: 'Server misconfiguration. Contact support.' }, 500);
    }

    let userId, token;
    try {
        ({ userId, token } = await request.json());
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    if (!userId || !token) {
        return json({ error: 'Missing userId or token.' }, 400);
    }

    const profRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`,
        {
            headers: {
                'apikey': env.SUPABASE_KEY,
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!profRes.ok) {
        return json({ error: 'Unable to verify session.' }, 401);
    }

    const profiles = await profRes.json();
    const role = profiles[0]?.role;

    if (!role) {
        return json({ error: 'Role not found.' }, 403);
    }

    return json({ role });
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
