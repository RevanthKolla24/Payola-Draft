// Account helpers contain no SDK imports or browser state.
export function readWithTimeout(promise, ms = 12000) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error('Account read timed out. Retry when connected; your local history is unchanged.'), { code: 'account/read-timeout' })), ms);
  })]).finally(() => clearTimeout(timer));
}

export function validateNewPassword(password, confirmation) {
  if (password !== password.trim()) throw new Error('Do not use leading or trailing password spaces; Job Tracker trims them.');
  if (password.length < 12 || password.length > 128) throw new Error('Use a password of 12–128 characters. The shared project password policy also applies.');
  if (password !== confirmation) throw new Error('Passwords do not match.');
}

export function emailActionSettings(origin, action) {
  if (!['verify', 'reset'].includes(action)) throw new Error('Unsupported email action.');
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Email actions require a website origin.');
  // Never forward arbitrary query strings, action codes, emails or redirect URLs.
  return { url: `${url.origin}/account?emailAction=${action}`, handleCodeInApp: false };
}

export function profileDetails(data) {
  if (!data) return { state: 'missing', firstName: '', lastName: '', email: '' };
  const firstName = typeof data.firstName === 'string' ? data.firstName : '';
  const lastName = typeof data.lastName === 'string' ? data.lastName : '';
  return { state: firstName.trim() && lastName.trim() && firstName.length <= 100 && lastName.length <= 100 ? 'complete' : 'incomplete', firstName, lastName, email: typeof data.email === 'string' ? data.email : '' };
}