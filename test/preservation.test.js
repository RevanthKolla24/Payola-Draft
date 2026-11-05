import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreservationTracker } from '../preservation.js';

test('sample/empty views never warn and cosmetic repaints preserve backup state', () => {
  const tracker = createPreservationTracker(), records = [];
  tracker.observe(['sample', records], false);
  assert.equal(tracker.unsaved, false);
  tracker.observe(['import', records], false);
  assert.equal(tracker.unsaved, false);
  tracker.observe(['manual', records], true);
  assert.equal(tracker.unsaved, true);
  tracker.downloaded();
  tracker.observe(['manual', records], true);
  assert.equal(tracker.unsaved, false);
});
test('edits during save stay unsaved and cloud deletion preserves independent downloads', () => {
  const tracker = createPreservationTracker();
  tracker.observe(['manual', 10], true);
  const captured = tracker.revision;
  tracker.observe(['manual', 20], true);
  tracker.cloudSaved(captured);
  assert.equal(tracker.unsaved, true);
  tracker.cloudSaved();
  assert.equal(tracker.unsaved, false);
  tracker.clearCloud();
  assert.equal(tracker.unsaved, true);
  tracker.downloaded(); tracker.cloudSaved(); tracker.clearCloud();
  assert.equal(tracker.unsaved, false);
});
test('restores form new identities while rejected/cancelled work leaves the current revision unchanged', () => {
  const tracker = createPreservationTracker(), source = {};
  tracker.observe([source], true); tracker.downloaded();
  const revision = tracker.revision;
  tracker.observe([source], true);
  assert.equal(tracker.revision, revision);
  assert.equal(tracker.unsaved, false);
  tracker.observe([{}], true);
  assert.equal(tracker.unsaved, true);
});