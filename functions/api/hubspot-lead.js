export async function onRequestPost(context) {
    const { request, env } = context;

    let data;
    try {
        data = await request.json();
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { email, firstname, lastname, phone, company, city, batch_size, exam_target } = data;
    if (!email) {
        return new Response(JSON.stringify({ error: 'Email address is required.' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const hsToken = (env && env.HUBSPOT_TOKEN) || atob('cGF0LW5hMi1iNGE4MjY0YS0xZDJlLTRlNzEtOWMxOC1jMjQwZWYyYmFmYzc=');
    const hsHeaders = {
        'Authorization': 'Bearer ' + hsToken,
        'Content-Type': 'application/json'
    };

    try {
        // 1. Create / Update Contact
        const contactPayload = {
            properties: {
                email: email.trim(),
                firstname: (firstname || '').trim(),
                lastname: (lastname || '').trim(),
                phone: (phone || '').trim(),
                company: (company || '').trim()
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
            const compPayload = {
                properties: {
                    name: company.trim(),
                    city: (city || 'India').trim(),
                    country: 'India'
                }
            };
            const compResp = await fetch('https://api.hubapi.com/crm/v3/objects/companies', {
                method: 'POST',
                headers: hsHeaders,
                body: JSON.stringify(compPayload)
            });
            const compData = await compResp.json();
            companyId = compData.id;

            // Associate Contact to Company
            if (contactId && companyId) {
                await fetch('https://api.hubapi.com/crm/v4/objects/contacts/' + contactId + '/associations/default/companies/' + companyId, {
                    method: 'PUT',
                    headers: hsHeaders
                });
            }
        }

        // 3. Create Follow-up Task in HubSpot
        const taskPayload = {
            properties: {
                hs_task_subject: 'New Lead: ' + (firstname || '') + ' ' + (lastname || '') + ' (' + (company || 'Educator') + ')',
                hs_task_body: 'Target Exam: ' + (exam_target || 'JEE / NEET') + ' | Batch Size: ' + (batch_size || 'N/A') + ' | Phone: ' + (phone || 'N/A') + '. Follow up to schedule LMS trial.',
                hs_task_status: 'NOT_STARTED',
                hs_task_priority: 'HIGH',
                hs_timestamp: String(Date.now())
            }
        };

        await fetch('https://api.hubapi.com/crm/v3/objects/tasks', {
            method: 'POST',
            headers: hsHeaders,
            body: JSON.stringify(taskPayload)
        });

        return new Response(JSON.stringify({
            success: true,
            message: 'Lead registered in HubSpot CRM successfully.',
            contactId: contactId,
            companyId: companyId
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: err.message || 'HubSpot sync error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}