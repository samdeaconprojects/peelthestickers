// Size limits for groups and live rooms, set from the capacity numbers in
// docs/SHARED_AVERAGES_LOADTEST.md. They are checked before the write rather
// than atomically, so a burst of joins can overshoot by a few, which is fine
// for a limit that only protects capacity. Load tests can raise them with env.

function readCap(envValue, fallback) {
  const parsed = Number(envValue);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const MAX_GROUP_MEMBERS = readCap(process.env.PTS_MAX_GROUP_MEMBERS, 100);
// Live rooms: spectators poll more slowly as a room grows (spectatorPollMs in
// liveRoomCache.js), which is what lets one process carry 5,000.
const MAX_ROOM_MEMBERS = readCap(process.env.PTS_MAX_ROOM_MEMBERS, 5000);

// Someone already inside doesn't take a new place, so they can always come
// back, even to a full room or a group that was over the cap before it existed.
function hasPlaceFor(memberIDs, userID, max) {
  const members = Array.isArray(memberIDs) ? memberIDs : [];
  return members.includes(userID) || members.length < max;
}

module.exports = {
  MAX_GROUP_MEMBERS,
  MAX_ROOM_MEMBERS,
  readCap,
  hasPlaceFor,
};
