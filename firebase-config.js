// Web configuration is public. This endpoint must never include admin credentials.
export function accountConfiguration(env) {
  if (env.ENABLE_FIREBASE_ACCOUNTS !== 'true') return null;
  const projectId = env.FIREBASE_PROJECT_ID || 'job-tracker-project-c4e87';
  const authDomain = env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
  if (!/^[a-z][a-z0-9-]{4,60}$/.test(projectId) || !/^[a-z0-9.-]+$/.test(authDomain)
    || !/^AIza[\w-]{20,100}$/.test(env.FIREBASE_API_KEY || '') || !/^1:\d+:web:[a-f0-9]+$/.test(env.FIREBASE_APP_ID || '')) return null;
  return { apiKey: env.FIREBASE_API_KEY, authDomain, projectId, appId: env.FIREBASE_APP_ID };
}