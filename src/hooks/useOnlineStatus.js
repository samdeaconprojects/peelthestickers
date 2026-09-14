// src/hooks/useOnlineStatus.js
import { useEffect, useState } from "react";
import { getIsOnline, subscribeConnectivity } from "../services/connectivity";

export default function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(getIsOnline());

  useEffect(() => {
    return subscribeConnectivity(setIsOnline);
  }, []);

  return isOnline;
}
