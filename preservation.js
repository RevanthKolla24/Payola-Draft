// Track complete-session backups, not CSV/image exports or cosmetic UI changes.
export function createPreservationTracker() {
  let identity = null, revision = 0, downloaded = -1, cloud = -1, hasHistory = false;
  return {
    observe(next, realHistory) {
      if (!identity || next.length !== identity.length || next.some((value, index) => !Object.is(value, identity[index]))) {
        revision++; identity = next.slice();
      }
      hasHistory = realHistory;
    },
    get revision() { return revision; },
    get unsaved() { return hasHistory && downloaded !== revision && cloud !== revision; },
    downloaded(value = revision) { downloaded = value; },
    cloudSaved(value = revision) { cloud = value; },
    clearCloud() { cloud = -1; }
  };
}