/**
 * GET /api/moodle-config
 * Header: Authorization: Bearer <access_token>
 * Returns: { configured: bool, moodle_url?, moodle_token? }
 *
 * Fetches the Moodle connection settings from Supabase on behalf
 * of the authenticated owner. Supabase RLS ensures only owners
 * can read this row.
 */
export async function onRequestGet(context) {
    const { request, env } = context;

    if (!env.SUPABASE_URL || !env.SUPABASE_KEY) {
        return json({ error: 'Server misconfiguration. Contact support.' }, 500);
    }

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        return json({ error: 'Unauthorized.' }, 401);
    }

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/moodle_config?id=eq.1&select=moodle_url,moodle_token`,
        {
            headers: {
                'apikey': env.SUPABASE_KEY,
                'Authorization': `Bearer ${token}`
            }
        }
    );

    if (!res.ok) {
        return json({ error: 'Unable to fetch Moodle configuration.' }, 401);
    }

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

export function onRequestPost() {
    return new Response('Method Not Allowed', { status: 405 });
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
