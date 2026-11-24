// src/smart/createSmartCubeClient.js
import { AutoCubeClient } from "./autoCubeClient";
import { GanCubeClient } from "./ganCubeClient";
import { MoyuCubeClient } from "./moyuCubeClient";

// "auto" (the default) lets the picked cube choose its driver; a brand name
// forces one, for debugging a cube the name check gets wrong.
export function createSmartCubeClient(provider = "auto") {
  const p = String(provider || "auto").trim().toLowerCase();

  switch (p) {
    case "moyu-wcu":
    case "moyu":
    case "moyu-ai":
      return new MoyuCubeClient();

    case "gan-gen2-compatible":
    case "gan":
      return new GanCubeClient();

    case "auto":
    default:
      return new AutoCubeClient();
  }
}
