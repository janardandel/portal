/**
 * POST /api/verify
 * Body: { userId, token }
 * Returns: { role }
 *
 * Called by owner-dashboard on every load to confirm the session
 * user is still an owner according to Supabase.
 */
const SUPABASE_URL = 'https://lekvzyoarawotlsbeoqa.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3Z6eW9hcmF3b3Rsc2Jlb3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTgzNTIsImV4cCI6MjA5Mzg3NDM1Mn0.KO-UyQerUdbxxhqBDX5F51ZMU2WGIi6BLg-b-rDALmk';

export async function onRequestPost(context) {
    const { request, env } = context;
    const supabaseUrl = env.SUPABASE_URL || SUPABASE_URL;
    const supabaseKey = env.SUPABASE_KEY || SUPABASE_KEY;

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
        `${supabaseUrl}/rest/v1/profiles?id=eq.${userId}&select=role`,
        {
            headers: {
                'apikey': supabaseKey,
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
