'use strict';
// Only the extension service worker owns the refresh token. No disk/sync storage.
const SessionAuth = (() => {
  const KEY = 'reading.google.session.v1';
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const messages = {
    expired: '로그인이 만료되었습니다. 같은 Google 계정으로 다시 로그인하세요.',
    unavailable: '로그인 확인 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',
    denied: '사전 등록된 Google 계정과 참여 권한을 확인하세요.',
    changed: '기존 제출은 같은 Google 계정으로만 재시도할 수 있습니다.',
    cancelled: 'Google 로그인 시도가 종료되었습니다. 다시 로그인하세요.'
  };
  function failure(code, status) { return Object.assign(Error(messages[code]), {code, status}); }
  const validToken = value => typeof value === 'string' && value.length > 0 && value.length <= 8192 && !/\s/.test(value);
  function create({config, storage, login, fetchImpl = fetch, now = Date.now, notify = () => {}}) {
    const base = new URL(config.authUrl);
    if (base.protocol !== 'https:' || base.pathname !== '/' || base.username || base.password || base.search || base.hash) throw failure('unavailable');
    const scope = base.origin + '|' + config.endpoint;
    let generation = 0, active = null, inFlight = null, inFlightEpoch = -1, inFlightRejected, signingIn = false, signingOut = false, writes = Promise.resolve();
    const ready = Promise.resolve().then(() => storage.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}));
    ready.catch(() => {}); // A storage failure is reported to the caller, never bypassed.
    // Serialize storage mutations; logout invalidates network work immediately.
    function write(value, epoch) {
      const result = writes.then(async () => {
        await ready;
        if (epoch !== generation) throw failure('cancelled');
        if (value) await storage.set({[KEY]:value}); else await storage.remove(KEY);
        active = value;
      });
      writes = result.catch(() => {});
      return result;
    }
    function valid(record) {
      return record?.scope === scope && uuid.test(record.userId || '') && typeof record.email === 'string' && record.email.length <= 320 &&
        validToken(record.accessToken) && validToken(record.refreshToken) && Number.isFinite(record.expiresAt);
    }
    function check(epoch) { if (epoch !== generation) throw failure('cancelled'); }
    async function request(path, {token, body, method = body ? 'POST' : 'GET'} = {}) {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetchImpl(base.origin + path, {method, headers:{apikey:config.publicKey,
          ...(token ? {Authorization:'Bearer ' + token} : {}), ...(body ? {'Content-Type':'application/json'} : {})},
          ...(body ? {body:JSON.stringify(body)} : {}), credentials:'omit', cache:'no-store', redirect:'error', signal:controller.signal});
        if (!response.ok) {
          if (response.status === 401 || (path.includes('grant_type=refresh_token') && response.status === 400)) throw failure('expired', 401);
          if (response.status === 403) throw failure('denied', 403);
          throw failure('unavailable', 503);
        }
        return response.status === 204 ? null : await response.json();
      } catch (error) { if (error.code && messages[error.code]) throw error; throw failure('unavailable', 503); }
      finally { clearTimeout(timer); }
    }
    async function verify(record, epoch, claim = false) {
      const user = await request('/auth/v1/user', {token:record.accessToken}); check(epoch);
      const email = typeof user?.email === 'string' ? user.email.trim().toLowerCase() : '';
      if (user?.id !== record.userId || email !== record.email || !user.email_confirmed_at ||
          !user.identities?.some(i => i.provider === 'google' && i.identity_data?.email_verified === true && i.identity_data?.email?.toLowerCase() === email)) throw failure('expired', 401);
      if (claim && await request('/rest/v1/rpc/claim_google_pilot_access', {token:record.accessToken, body:{}}) !== true) throw failure('denied', 403);
      check(epoch);
      if (await request('/rest/v1/rpc/is_active_pilot_member', {token:record.accessToken, body:{}}) !== true) throw failure('denied', 403);
      check(epoch);
    }
    const view = record => record ? {accessToken:record.accessToken, userId:record.userId, email:record.email} : null;
    async function get({expectedUserId, rejectedToken} = {}) {
      if (signingOut) return null;
      // Every caller, including simultaneous callers, checks its own UID binding.
      const epoch = generation;
      let joinedWithoutRefresh = false;
      if (!inFlight || inFlightEpoch !== epoch) {
        inFlightEpoch = epoch;
        inFlightRejected = rejectedToken;
        const operation = (async () => {
          await ready; await writes; check(epoch);
          let record = active || (await storage.get(KEY))[KEY]; check(epoch);
          if (!record) return null;
          if (!valid(record)) { await write(null, epoch); notify('cleared'); return null; }
          try {
            let refreshedOnce = false;
            async function refresh() {
              const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {body:{refresh_token:record.refreshToken}}); check(epoch);
              if (!validToken(refreshed?.access_token) || !validToken(refreshed?.refresh_token) || !Number.isFinite(refreshed?.expires_in) || refreshed.expires_in <= 0 || refreshed.expires_in > 86400 || refreshed.user?.id !== record.userId) throw failure('expired', 401);
              record = {...record, accessToken:refreshed.access_token, refreshToken:refreshed.refresh_token, expiresAt:now() + refreshed.expires_in * 1000};
              // Preserve rotation before subsequent network checks, even if offline next.
              await write(record, epoch);
              refreshedOnce = true;
            }
            if (record.expiresAt <= now() + 90000 || rejectedToken === record.accessToken) await refresh();
            try { await verify(record, epoch); }
            catch (error) { if (error.status !== 401 || refreshedOnce) throw error; await refresh(); await verify(record, epoch); }
            active = record;
            return view(record);
          } catch (error) {
            if (epoch === generation && [401,403].includes(error.status)) { await write(null, epoch); notify('cleared'); }
            throw error;
          }
        })();
        inFlight = operation;
        operation.finally(() => { if (inFlight === operation) inFlight = null; }).catch(() => {});
      } else joinedWithoutRefresh = !!rejectedToken && inFlightRejected !== rejectedToken;
      const result = await inFlight;
      check(epoch);
      if (result && expectedUserId && result.userId !== expectedUserId) throw failure('changed', 409);
      if (joinedWithoutRefresh && result?.accessToken === rejectedToken) return get({expectedUserId, rejectedToken});
      return result;
    }
    async function signIn({expectedUserId} = {}) {
      if (signingIn || signingOut) throw failure('cancelled');
      signingIn = true;
      const epoch = ++generation;
      try {
        await ready;
        const session = await login(); check(epoch);
        const record = {...session, scope};
        if (!valid(record)) throw failure('expired', 401);
        if (expectedUserId && record.userId !== expectedUserId) throw failure('changed', 409);
        await verify(record, epoch, true);
        await write(record, epoch); check(epoch); notify('signed-in');
        return view(record);
      } finally { signingIn = false; }
    }
    async function signOut() {
      if (signingOut) throw failure('cancelled');
      signingOut = true;
      const epoch = ++generation;
      login.cancel?.();
      let record;
      try {
        await ready; await writes;
        record = active || (await storage.get(KEY))[KEY];
        await write(null, epoch); notify('cleared');
      } finally { signingOut = false; }
      let revoked = true;
      if (valid(record)) {
        try { await request('/auth/v1/logout?scope=local', {token:record.accessToken, method:'POST'}); }
        catch (error) { revoked = error.status === 401; }
      }
      return {revoked};
    }
    return {get, signIn, signOut};
  }
  function trusted(sender, extensionId) {
    return sender?.id === extensionId && !sender.tab && sender.url === `chrome-extension://${extensionId}/sidepanel.html`;
  }
  function install({chrome, manager}) {
    chrome.runtime.onMessage.addListener((message, sender, respond) => {
      if (message?.type !== 'reading-auth') return;
      if (!trusted(sender, chrome.runtime.id) || !['get','signIn','signOut'].includes(message.action)) {
        respond({ok:false, code:'denied', status:403, message:messages.denied}); return;
      }
      Promise.resolve().then(() => manager[message.action]({expectedUserId:message.expectedUserId, rejectedToken:message.rejectedToken})).then(
        value => respond({ok:true, value}),
        error => respond({ok:false, code:messages[error.code] ? error.code : 'unavailable', status:error.status || 503,
          message:messages[error.code] || messages.unavailable})
      );
      return true;
    });
  }
  return {create, install, KEY, messages};
})();
if (typeof module !== 'undefined') module.exports = SessionAuth;
