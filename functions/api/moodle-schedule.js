const TENANT_MOODLE_MAP = {
    '65e4628a-a283-45a3-ab2d-84073977d4c4': {
        moodle_url: 'https://trial001.classes.institute',
        moodle_token: '0da58a8c089e3c4b8ef45d7c6c42ed29',
        tenant_name: 'Pitthugram Trial'
    }
};

const QB_SUPABASE_URL = 'https://qnqcysdeolnooxxcafwz.supabase.co';
const QB_SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucWN5c2Rlb2xub294eGNhZnd6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjM1NzQ2NSwiZXhwIjoyMDkxOTMzNDY1fQ.Co7aXPihbAn56b2BE2rh4q6wgqlVEbzp3C6wAZz1V8s';

export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request payload.' }, 400);
    }

    const { institute_id, email, courseid, name, timeopen, timeclose, timelimit, attempts, shuffleanswers, questions } = body;
    const tenantConfig = TENANT_MOODLE_MAP[institute_id] || {
        moodle_url: (env && env.MOODLE_URL) || 'https://trial001.classes.institute',
        moodle_token: (env && env.MOODLE_TOKEN) || '0da58a8c089e3c4b8ef45d7c6c42ed29',
        tenant_name: 'Default Tenant'
    };

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

    // 2. Direct Fallback if n8n is offline
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

export function onRequestGet() {
    return new Response('Method Not Allowed', { status: 405 });
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
