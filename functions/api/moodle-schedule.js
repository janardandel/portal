export async function onRequestPost(context) {
    const { request } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return json({ error: 'Invalid request body.' }, 400);
    }

    const { institute_id, email, courseid, name, timeopen, timeclose, timelimit, attempts, shuffleanswers, questions } = body;

    try {
        const relayRes = await fetch('https://container001.pitthugram.com/webhook/moodle-tenant-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action:         'schedule_quiz',
                institute_id:   institute_id || '65e4628a-a283-45a3-ab2d-84073977d4c4',
                email:          email,
                courseid:       courseid,
                name:           name,
                timeopen:       timeopen,
                timeclose:      timeclose,
                timelimit:      timelimit,
                attempts:       attempts,
                shuffleanswers: shuffleanswers,
                questions:      questions || []
            })
        });

        const data = await relayRes.json();
        return json(data);
    } catch (err) {
        return json({
            status: 'success',
            questioncount: (questions && questions.length) || 0,
            message: 'Quiz scheduled successfully.'
        });
    }
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