// Only imported after an explicit account connection. No analytics or Storage SDK.
export async function connectFirebase(config) {
  const [appSDK, authSDK, dbSDK] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js')
  ]);
  const app = appSDK.initializeApp(config, 'payola-accounts');
  // Persistent storage is only populated by the explicit Remember checkbox.
  const auth = authSDK.initializeAuth(app, { persistence: [authSDK.browserLocalPersistence, authSDK.inMemoryPersistence] });
  const db = dbSDK.initializeFirestore(app, { localCache: dbSDK.memoryLocalCache() });
  await auth.authStateReady();
  return { auth, authSDK, db, dbSDK };
}