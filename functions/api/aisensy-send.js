export async function onRequestPost(context) {
    const { request, env } = context;

    const aisensyKey = (env && env.AISENSY_KEY) || '';
    if (!aisensyKey) {
        return json({ error: 'WhatsApp sender is not configured.' }, 500);
    }

    let data;
    try {
        data = await request.json();
    } catch {
        return json({ error: 'Invalid JSON payload.' }, 400);
    }

    const { phone, firstname, lastname, company, moodleUrl, teacherUser, teacherPass } = data;
    if (!phone || !firstname) {
        return json({ error: 'phone and firstname are required.' }, 400);
    }

    const rawPhone = String(phone).replace(/[^0-9]/g, '');
    const cleanPhone = rawPhone.length === 10 ? '91' + rawPhone : rawPhone;

    try {
        const resp = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                apiKey: aisensyKey,
                campaignName: 'pitthugram_welcome',
                destination: cleanPhone,
                userName: firstname + (lastname ? ' ' + lastname : ''),
                templateParams: [
                    firstname,
                    company || 'Coaching Institute',
                    moodleUrl || 'https://cx001.pitthugram.com',
                    teacherUser || '',
                    teacherPass || ''
                ]
            })
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            return json({ error: 'AiSensy send failed: ' + errBody }, 502);
        }

        return json({ sent: true });
    } catch (err) {
        return json({ error: err.message || 'AiSensy dispatch error.' }, 500);
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
