// Verified against Firebase apps:sdkconfig for the existing shared web app.
// These are public web identifiers, NOT Admin SDK credentials or an access grant.
export const SHARED_FIREBASE_CONFIG = Object.freeze({
  apiKey: 'AIzaSyArx1pcI2Pz89TH6RFIUaoEjthQy241S0M',
  authDomain: 'job-tracker-project-c4e87.firebaseapp.com',
  projectId: 'job-tracker-project-c4e87',
  appId: '1:731379897908:web:781e1fa750aecb46101c61'
});

export function accountConfiguration(env) {
  // Works on Render without manually copying public keys. Explicit false remains
  // an emergency off switch. Partial overrides fail closed instead of mixing apps.
  if (env.ENABLE_FIREBASE_ACCOUNTS === 'false') return null;
  const fields = ['FIREBASE_PROJECT_ID', 'FIREBASE_AUTH_DOMAIN', 'FIREBASE_API_KEY', 'FIREBASE_APP_ID'];
  if (!fields.some(key => env[key] !== undefined)) return { ...SHARED_FIREBASE_CONFIG };
  if (!fields.every(key => typeof env[key] === 'string' && env[key].trim())) return null;
  const projectId = env.FIREBASE_PROJECT_ID.trim();
  const authDomain = env.FIREBASE_AUTH_DOMAIN.trim();
  if (!/^[a-z][a-z0-9-]{4,60}$/.test(projectId) || !/^[a-z0-9.-]+$/.test(authDomain)
    || !/^AIza[\w-]{20,100}$/.test(env.FIREBASE_API_KEY || '') || !/^1:\d+:web:[a-f0-9]+$/.test(env.FIREBASE_APP_ID || '')) return null;
  return { apiKey: env.FIREBASE_API_KEY, authDomain, projectId, appId: env.FIREBASE_APP_ID };
}