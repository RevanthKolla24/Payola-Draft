// Create-only shared-profile recovery. Existing profiles (including roles) are opaque.
export function createProfileStore(sdk, db, account, stillCurrent = () => true) {
  const ref = sdk.doc(db, 'users', account.uid);
  const guard = () => { if (!stillCurrent()) throw new Error('Account changed. Retry account setup using the current account.'); };
  return {
    async exists() {
      guard(); const snapshot = await sdk.getDocFromServer(ref); guard();
      return snapshot.exists();
    },
    async finish(firstName, lastName) {
      firstName = firstName.trim(); lastName = lastName.trim();
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) throw new Error('Enter first and last names of up to 100 characters each.');
      guard();
      const created = await sdk.runTransaction(db, async tx => {
        guard(); const snapshot = await tx.get(ref); guard();
        if (snapshot.exists()) return false;
        tx.set(ref, { firstName, lastName, email: account.email, createdAt: sdk.serverTimestamp() });
        return true;
      });
      guard(); return created;
    }
  };
}