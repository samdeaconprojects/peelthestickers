// src/smart/smartCubeProviderMeta.js
export const SMART_CUBE_PROVIDER_META = {
  gan: {
    label: "GAN / GAN-Protocol",
    shortLabel: "GAN",
  },
  "gan-gen2-compatible": {
    label: "GAN Gen2 Compatible",
    shortLabel: "Gen2",
  },
  "moyu-wcu": {
    label: "MoYu WCU",
    shortLabel: "MoYu",
  },
  auto: {
    label: "Smart Cube",
    shortLabel: "Smart Cube",
  },
};

export function getSmartCubeProviderLabel(provider) {
  return SMART_CUBE_PROVIDER_META?.[provider]?.label || "Smart Cube";
}