import { readWithTimeout, profileDetails } from './account-utils.js';

// Recovery remains create-only; explicit name edits never replace a profile.
export function createProfileStore(sdk, db, account, stillCurrent = () => true, readTimeout = 12000) {
  const ref = sdk.doc(db, 'users', account.uid);
  const guard = () => { if (!stillCurrent()) throw new Error('Account changed. Retry account setup using the current account.'); };
  return {
    async exists() {
      guard(); const snapshot = await readWithTimeout(sdk.getDocFromServer(ref), readTimeout); guard();
      return snapshot.exists();
    },
    async read() {
      guard(); const snapshot = await readWithTimeout(sdk.getDocFromServer(ref), readTimeout); guard();
      return profileDetails(snapshot.exists() ? snapshot.data() : null);
    },
    async updateNames(firstName, lastName) {
      firstName = firstName.trim(); lastName = lastName.trim();
      if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) throw new Error('Enter first and last names of up to 100 characters each.');
      guard();
      await sdk.runTransaction(db, async tx => {
        guard(); const snapshot = await tx.get(ref); guard();
        if (!snapshot.exists()) throw new Error('Shared profile is missing. Check shared profile setup and finish it first.');
        if (snapshot.data().email !== account.email) throw new Error('The shared profile email differs from your login. Name editing is paused until the project owner resolves it; no fields were changed.');
        tx.update(ref, { firstName, lastName });
      });
      guard();
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