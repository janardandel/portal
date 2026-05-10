/**
 * GET /api/moodle-config
 * Header: Authorization: Bearer <access_token>
 * Returns: { configured: bool, moodle_url?, moodle_token? }
 *
 * Fetches the Moodle connection settings from Supabase on behalf
 * of the authenticated owner. Supabase RLS ensures only owners
 * can read this row.
 */
const SUPABASE_URL = 'https://lekvzyoarawotlsbeoqa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3Z6eW9hcmF3b3Rsc2Jlb3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTgzNTIsImV4cCI6MjA5Mzg3NDM1Mn0.KO-UyQerUdbxxhqBDX5F51ZMU2WGIi6BLg-b-rDALmk';

export async function onRequestGet(context) {
    const { request, env } = context;
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY || SUPABASE_KEY;

    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!token) {
        return json({ error: 'Unauthorized.' }, 401);
    }

    const res = await fetch(
        `${supabaseUrl}/rest/v1/moodle_config?id=eq.1&select=moodle_url,moodle_token`,
        {
            headers: {
                'apikey': supabaseKey,
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
