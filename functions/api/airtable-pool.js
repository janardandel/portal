const AIRTABLE_BASE = 'appJUgBQPQHElMNrN';
const AIRTABLE_TABLE = 'tblIbHhU3t3DYLzWE';

export async function onRequestPost(context) {
    const { env } = context;

    const atToken = (env && env.AIRTABLE_TOKEN) || '';
    if (!atToken) {
        return json({ error: 'Credential pool is not configured.' }, 500);
    }
    const atHeaders = {
        'Authorization': 'Bearer ' + atToken,
        'Content-Type': 'application/json'
    };

    try {
        const filterUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}?filterByFormula=NOT({Used})&maxRecords=1`;
        const atResp = await fetch(filterUrl, { headers: atHeaders });
        const atData = await atResp.json();

        if (!atData.records || atData.records.length === 0) {
            return json({ allocated: false });
        }

        const rec = atData.records[0];
        const f = rec.fields;

        const studentLogins = [];
        for (let i = 1; i <= 5; i++) {
            const sUser = f['Student' + i + ' Username'];
            const sPass = f['Student' + i + ' Password'];
            if (sUser && sPass) {
                studentLogins.push({ num: i, username: sUser, password: sPass });
            }
        }

        // Lock & mark used immediately so no other request can claim it
        await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE}/${AIRTABLE_TABLE}/${rec.id}`, {
            method: 'PATCH',
            headers: atHeaders,
            body: JSON.stringify({ fields: { Used: true } })
        });

        return json({
            allocated: true,
            moodleUrl: f['Coaching URL'] || null,
            teacherUser: f['Teacher Username'] || null,
            teacherPass: f['Teacher Password'] || null,
            studentLogins
        });
    } catch (err) {
        return json({ error: err.message || 'Credential pool lookup failed.' }, 500);
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
