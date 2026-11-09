export const testPasswords = { manager: 'manager', member: 'member' };
export const testAuthEnv = {
  BP_MANAGER_PASSWORD: testPasswords.manager,
  BP_MEMBER_PASSWORD: testPasswords.member,
};
export function createTestClient(base, username = 'manager') {
  let cookie = '';
  return async function client(url, options = {}) {
    if (!cookie) {
      const response = await fetch(base + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: testPasswords[username] }),
      });
      if (!response.ok) throw new Error('Test login failed: ' + response.status);
      cookie = response.headers.get('set-cookie').split(';')[0];
    }
    const headers = new Headers(options.headers);
    headers.set('Cookie', cookie);
    if (options.method === 'PUT' && /\/api\/records\//.test(url) && options.body) {
      const data = JSON.parse(options.body);
      if (data && typeof data === 'object' && !Object.hasOwn(data, 'configVersion')) {
        data.configVersion = (
          await (await fetch(base + '/api/config', { headers: { Cookie: cookie } })).json()
        ).version;
        options = { ...options, body: JSON.stringify(data) };
      }
    }
    return fetch(url, { ...options, headers });
  };
}
