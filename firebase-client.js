// Only imported after an explicit account connection. No analytics or Storage SDK.
let connection;
export function connectFirebase(config) {
  if (!connection) connection = initialize(config).catch(error => { connection = null; throw error; });
  return connection;
}

async function initialize(config) {
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
  ]);
  const app = appSDK.getApps().find(app => app.name === 'payola-accounts') || appSDK.initializeApp(config, 'payola-accounts');
  // Persistent storage is only populated by the explicit Remember checkbox.
  let auth;
  try { auth = authSDK.initializeAuth(app, { persistence: [authSDK.browserLocalPersistence, authSDK.inMemoryPersistence] }); }
  catch (error) { if (error.code !== 'auth/already-initialized') throw error; auth = authSDK.getAuth(app); }
  const db = dbSDK.getFirestore(app); // Default memory cache, no offline persistence.
  await auth.authStateReady();
  return { auth, authSDK, db, dbSDK };
}