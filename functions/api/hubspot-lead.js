export async function onRequestPost(context) {
    const { request, env } = context;

    let data;
    try {
        data = await request.json();
    } catch {
        return json({ error: 'Invalid JSON payload.' }, 400);
    }

    const { email, firstname, lastname, phone, company, city, batch_size, exam_target,
            moodleUrl, teacherUser, teacherPass, existing } = data;
    if (!email) {
        return json({ error: 'Email address is required.' }, 400);
    }

    const hsToken = (env && env.HUBSPOT_TOKEN) || '';
    const hsHeaders = {
        'Authorization': 'Bearer ' + hsToken,
        'Content-Type': 'application/json'
    };

    try {
        if (existing) {
            await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify({
                    properties: {
                        hs_task_subject: '🔁 Reactivation Request: ' + (firstname || '') + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                        hs_task_body: 'Existing contact requested trial reactivation. Phone: ' + (phone || 'N/A') + ' | Email: ' + email,
                        hs_task_status: 'NOT_STARTED',
                        hs_task_priority: 'HIGH',
                        hs_timestamp: String(Date.now())
                    }
                })
            });
            return json({ success: true });
        }

        // 1. Create Contact
        const contactPayload = {
            properties: {
                email: email.trim(),
                firstname: (firstname || '').trim(),
                lastname: (lastname || '').trim(),
                phone: (phone || '').trim(),
                company: (company || '').trim(),
                ...(moodleUrl ? { moodle_url: moodleUrl } : {}),
                ...(teacherUser ? { moodle_username: teacherUser } : {}),
                ...(teacherPass ? { moodle_password: teacherPass } : {})
            }
        };

        const contactResp = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify(contactPayload)
        });
        const contactData = await contactResp.json();
        const contactId = contactData.id;

        // 2. Create Company if provided
        let companyId = null;
        if (company) {
            const compResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify({ properties: { name: company.trim(), city: (city || 'India').trim(), country: 'India' } })
            });
            const compData = await compResp.json();
            companyId = compData.id;

            if (contactId && companyId) {
                await fetch('https://api.hubapi.com/crm/v4/objects/contacts/' + contactId + '/associations/default/companies/' + companyId, {
                    method: 'PUT',
                    headers: hsHeaders
                });
            }
        }

        // 3. Create Follow-up Task
        let taskBody = 'Target Exam: ' + (exam_target || 'JEE / NEET') + ' | Batch Size: ' + (batch_size || 'N/A') +
                       ' | Phone: ' + (phone || 'N/A') + ' | Email: ' + email;
        if (teacherUser && teacherPass) {
            taskBody += '\n\nMOODLE CREDENTIALS ALLOCATED:\n• Moodle URL: ' + (moodleUrl || 'N/A') +
                        '\n• Teacher Login: ' + teacherUser + ' / ' + teacherPass;
        } else {
            taskBody += '\n\nNo pooled Moodle credentials were available — manual provisioning required.';
        }

        await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify({
                properties: {
                    hs_task_subject: '🔥 New LMS Trial: ' + (firstname || '') + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                    hs_task_body: taskBody,
                    hs_task_status: 'NOT_STARTED',
                    hs_task_priority: 'HIGH',
                    hs_timestamp: String(Date.now())
                }
            })
        });

        return json({ success: true, contactId, companyId });
    } catch (err) {
        return json({ error: err.message || 'HubSpot sync error' }, 500);
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
