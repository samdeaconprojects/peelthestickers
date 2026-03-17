// src/smart/createSmartCubeClient.js
import { GanCubeClient } from "./ganCubeClient";
import { MoyuCubeClient } from "./moyuCubeClient";

export function createSmartCubeClient(provider = "auto") {
  const p = String(provider || "auto").trim().toLowerCase();

  switch (p) {
    case "moyu-wcu":
      return new MoyuCubeClient();

    case "gan-gen2-compatible":
    case "gan":
      return new GanCubeClient();

    case "auto":
    default:
      return new GanCubeClient();
  }
}