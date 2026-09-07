const TENANT_MOODLE_MAP = {
    '65e4628a-a283-45a3-ab2d-84073977d4c4': {
        moodle_url: 'https://trial001.classes.institute',
        moodle_token: (env && env.MOODLE_TOKEN) || '',
        tenant_name: 'Pitthugram Trial'
    }
};

export async function onRequestGet(context) {
    const { request, env } = context;
    const u = new URL(request.url);
    const instituteId = u.searchParams.get('institute_id');
    return getCourses(instituteId, env);
}

export async function onRequestPost(context) {
    const { request, env } = context;
    let instituteId = null;
    try {
        const b = await request.json();
        instituteId = b.institute_id || null;
    } catch {}
    return getCourses(instituteId, env);
}

async function getCourses(instituteId, env) {
    const tenantConfig = TENANT_MOODLE_MAP[instituteId] || {
        moodle_url: (env && env.MOODLE_URL) || 'https://trial001.classes.institute',
        moodle_token: (env && env.MOODLE_TOKEN) || '',
        tenant_name: 'Default Trial'
    };
    const moodleUrl = tenantConfig.moodle_url;
    const moodleToken = tenantConfig.moodle_token;

    let courses = [
        { id: 2, fullname: "Class 11 - NEET Biology", shortname: "BIO11" },
        { id: 3, fullname: "Class 12 - JEE Chemistry", shortname: "CHEM12" },
        { id: 4, fullname: "Class 11 - JEE Chemistry", shortname: "CHEM11" },
        { id: 5, fullname: "Class 11 - JEE Physics", shortname: "PHY11" },
        { id: 6, fullname: "Class 11 - JEE Mathematics", shortname: "MATH11" },
        { id: 7, fullname: "Class 12 - NEET Biology", shortname: "BIO12" },
        { id: 8, fullname: "Class 12 - JEE Physics", shortname: "PHY12" },
        { id: 9, fullname: "Class 12 - JEE Mathematics", shortname: "MATH12" }
    ];

    try {
        const res = await fetch(`${moodleUrl}/webservice/rest/server.php?wstoken=${moodleToken}&wsfunction=core_course_get_courses&moodlewsrestformat=json`);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                const filtered = data.filter(function(c) { return c.id !== 1; }).map(function(c) {
                    return {
                        id: c.id,
                        fullname: c.fullname,
                        shortname: c.shortname
                    };
                });
                if (filtered.length > 0) courses = filtered;
            }
        }
    } catch (e) {
        console.warn('Moodle courses API fetch error:', e);
    }

    return json({ courses: courses, moodle_url: moodleUrl, institute_id: instituteId });
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}
