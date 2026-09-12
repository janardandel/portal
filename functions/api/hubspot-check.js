export async function onRequestPost(context) {
    const { request, env } = context;

    let email;
    try {
        ({ email } = await request.json());
    } catch {
        return json({ error: 'Invalid JSON payload.' }, 400);
    }
    if (!email) {
        return json({ error: 'Email address is required.' }, 400);
    }

    const hsToken = (env && env.HUBSPOT_TOKEN) || '';
    const hsHeaders = {
        'Authorization': 'Bearer ' + hsToken,
        'Content-Type': 'application/json'
    };

    try {
        const searchResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify({
                filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: email.trim().toLowerCase() }] }]
            })
        });
        const searchData = await searchResp.json();
        const existing = !!(searchData.total > 0 && searchData.results && searchData.results.length > 0);
        return json({
            existing,
            contactId: existing ? searchData.results[0].id : null
        });
    } catch (err) {
        // Fail open as "new" so signup isn't blocked by a CRM hiccup
        return json({ existing: false, contactId: null });
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
