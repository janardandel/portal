/* Pitthugram portal: keeps the login alive.
 * Supabase access tokens last about an hour. This renews them quietly (using the refresh token saved at
 * sign-in) shortly before they expire, swaps the fresh token into requests to our APIs, and retries once if
 * a request is rejected as expired. If the refresh token itself is no longer valid, it signs the user out
 * and returns to the sign-in page. Loaded first on every signed-in page. */
(function () {
    'use strict';
    var SUPABASE_URL = 'https://lekvzyoarawotlsbeoqa.supabase.co';
    var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxla3Z6eW9hcmF3b3Rsc2Jlb3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyOTgzNTIsImV4cCI6MjA5Mzg3NDM1Mn0.KO-UyQerUdbxxhqBDX5F51ZMU2WGIi6BLg-b-rDALmk';
    var API_HOSTS = ['https://api.classes.institute/', 'https://api.pitthugram.com/'];
    var SUPABASE_DATA = [SUPABASE_URL + '/rest/', SUPABASE_URL + '/storage/'];
    var RENEW_MARGIN_S = 120;          // renew when less than 2 minutes remain
    var SIGN_IN_PAGE = 'index.html';

    var origFetch = window.fetch.bind(window);
    var inflight = null;               // one renewal at a time in this tab

    function getToken() { try { return localStorage.getItem('pg_access_token') || ''; } catch (e) { return ''; } }
    function getRefresh() { try { return localStorage.getItem('pg_refresh_token') || ''; } catch (e) { return ''; } }

    function expOf(token) {
        try {
            var p = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
            while (p.length % 4) p += '=';
            return JSON.parse(atob(p)).exp || 0;
        } catch (e) { return 0; }
    }
    function secondsLeft(token) { return expOf(token) - Math.floor(Date.now() / 1000); }
    function isOurApi(url) { return API_HOSTS.some(function (h) { return url.indexOf(h) === 0; }); }
    function isTarget(url) { return isOurApi(url) || SUPABASE_DATA.some(function (h) { return url.indexOf(h) === 0; }); }

    function signOut() {
        try { ['pg_access_token', 'pg_refresh_token', 'pg_user', 'pg_role', 'pg_memberships'].forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
        if (!/(^|\/)(index\.html)?$/.test(location.pathname)) location.replace(SIGN_IN_PAGE);
    }

    function doRefresh() {
        var refresh = getRefresh();
        if (!refresh) return Promise.resolve(false);
        return origFetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
            body: JSON.stringify({ refresh_token: refresh })
        }).then(function (res) {
            if (res.status === 400 || res.status === 401 || res.status === 403) return 'invalid';
            if (!res.ok) return 'unavailable';
            return res.json();
        }).then(function (data) {
            if (data === 'invalid') return false;
            if (data === 'unavailable' || !data || !data.access_token) return null;
            try {
                localStorage.setItem('pg_access_token', data.access_token);
                if (data.refresh_token) localStorage.setItem('pg_refresh_token', data.refresh_token);
            } catch (e) {}
            return true;
        }).catch(function () { return null; });     // network problem: try again later, do not sign out
    }

    // Renew if the token is (nearly) expired. Resolves true when a usable token is in place.
    function ensureFresh(force) {
        var token = getToken();
        if (!token) return Promise.resolve(false);
        if (!force && secondsLeft(token) > RENEW_MARGIN_S) return Promise.resolve(true);
        if (inflight) return inflight;
        var run = function () {
            // another tab may have renewed while we waited for the lock
            var now = getToken();
            if (!force && now && now !== token && secondsLeft(now) > RENEW_MARGIN_S) return Promise.resolve(true);
            return doRefresh().then(function (ok) {
                if (ok === false) { signOut(); return false; }
                if (ok === null) return secondsLeft(getToken()) > 0;   // could not renew; keep going only if still valid
                return true;
            });
        };
        inflight = (navigator.locks && navigator.locks.request
            ? navigator.locks.request('pg-token-refresh', run)
            : run()
        ).then(function (r) { inflight = null; return r; }, function (e) { inflight = null; throw e; });
        return inflight;
    }

    function withCurrentBearer(init) {
        init = init || {};
        var h = init.headers;
        if (!h) return init;
        var current = getToken();
        var get = function () { return h instanceof Headers ? h.get('Authorization') : h.Authorization || h.authorization; };
        var auth = get();
        if (!auth || auth.indexOf('Bearer ') !== 0) return init;
        var sent = auth.slice(7);
        if (sent === SUPABASE_ANON || sent === current || !current) return init;
        if (h instanceof Headers) { h = new Headers(h); h.set('Authorization', 'Bearer ' + current); }
        else { h = Object.assign({}, h); if ('authorization' in h) h.authorization = 'Bearer ' + current; else h.Authorization = 'Bearer ' + current; }
        return Object.assign({}, init, { headers: h });
    }

    window.fetch = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || String(input || '');
        if (!isTarget(url)) return origFetch(input, init);
        return ensureFresh(false).then(function () {
            return origFetch(input, withCurrentBearer(init));
        }).then(function (res) {
            if (res.status !== 401 || !isOurApi(url)) return res;
            // rejected as expired: renew once and retry once
            return ensureFresh(true).then(function (ok) {
                return ok ? origFetch(input, withCurrentBearer(init)) : res;
            });
        });
    };

    // keep it fresh while the page is open, and when the tab wakes up
    setInterval(function () { if (getToken()) ensureFresh(false); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && getToken()) ensureFresh(false); });

    window.pgSession = { ensureFresh: ensureFresh, secondsLeft: function () { return secondsLeft(getToken()); } };
})();
