// src/hooks/useOfflineQueue.js
import { useEffect, useState, useCallback } from "react";
import {
  getOfflineSolves,
  groupOfflineSolves,
  subscribeOfflineQueue,
} from "../services/offlineQueue";

/** Live-updating view of the offline solve queue for a given user. */
export default function useOfflineQueue(userID) {
  const id = String(userID || "").trim();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return subscribeOfflineQueue(() => setTick((t) => t + 1));
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  if (!id) {
    return { items: [], groups: [], count: 0, refresh };
  }

  const items = getOfflineSolves(id);
  const groups = groupOfflineSolves(id);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  void tick;

  return { items, groups, count: items.length, refresh };
}
