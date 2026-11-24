// src/smart/autoCubeClient.js
//
// One "Connect smart cube" button for every supported brand: a single Bluetooth
// picker lists GAN and MoYu cubes together, and the cube picked decides which
// driver (GanCubeClient / MoyuCubeClient) runs it.
//
// Both drivers call navigator.bluetooth.requestDevice() themselves (the GAN one
// inside gan-web-bluetooth), so while the chosen driver connects, that call is
// answered with the device already picked instead of opening a second picker.
// The first request asks for every brand's services and manufacturer data up
// front, since Chrome only grants what the picker asked for.

import { GanCubeClient } from "./ganCubeClient";
import { MoyuCubeClient, MOYU_NAME_PREFIXES } from "./moyuCubeClient";
import { MOYU_SERVICE_UUID, moyuCompanyIds } from "./moyuProtocol";

const GAN_NAME_PREFIXES = ["GAN", "MG", "AiCube"];
const GAN_SERVICES = [
  "6e400001-b5a3-f393-e0a9-e50e24dc4179", // gen2
  "8653000a-43e6-47b7-9cb0-5fc21d4ae340", // gen3
  "00000010-0000-fff7-fff6-fff5fff4fff0", // gen4
];
// gan-web-bluetooth's GAN_CIC_LIST: company ids 0x0001..0xff01.
const GAN_COMPANY_IDS = Array.from({ length: 256 }, (_v, i) => (i << 8) | 0x01);

export const SMART_CUBE_BRANDS = {
  gan: { key: "gan", label: "GAN cube" },
  moyu: { key: "moyu", label: "MoYu cube" },
};

/** Which driver a cube's advertised name belongs to ("gan" | "moyu" | null). */
export function brandForDeviceName(name) {
  const n = String(name || "");
  if (MOYU_NAME_PREFIXES.some((p) => n.startsWith(p))) return "moyu";
  if (GAN_NAME_PREFIXES.some((p) => n.startsWith(p))) return "gan";
  return null;
}

export function pickerOptions() {
  const companies = [...new Set([...GAN_COMPANY_IDS, ...moyuCompanyIds()])];
  return {
    filters: [...GAN_NAME_PREFIXES, ...MOYU_NAME_PREFIXES].map((namePrefix) => ({ namePrefix })),
    optionalServices: [...GAN_SERVICES, MOYU_SERVICE_UUID],
    optionalManufacturerData: companies,
  };
}

// Answer the driver's own requestDevice() with `device` while `run` is going.
async function withPickedDevice(device, run) {
  const bt = navigator.bluetooth;
  const original = bt.requestDevice;
  const hadOwn = Object.prototype.hasOwnProperty.call(bt, "requestDevice");
  let used = false;
  const answer = async (...args) => {
    if (used) return original.apply(bt, args);
    used = true;
    return device;
  };
  try {
    bt.requestDevice = answer;
    return await run();
  } finally {
    if (bt.requestDevice === answer) {
      if (hadOwn) bt.requestDevice = original;
      else delete bt.requestDevice;
    }
  }
}

export class AutoCubeClient {
  constructor() {
    this.inner = null;
    this.brand = null;
    this.deviceName = null;
  }

  get label() {
    return SMART_CUBE_BRANDS[this.brand]?.label || "Smart cube";
  }

  async connect(handlers = {}) {
    if (!navigator?.bluetooth?.requestDevice) {
      throw new Error("Web Bluetooth is not available in this browser.");
    }
    const device = await navigator.bluetooth.requestDevice(pickerOptions());
    if (!device) throw new Error("No smart cube selected.");
    const brand = brandForDeviceName(device.name);
    if (!brand) throw new Error(`Don't know how to talk to "${device.name || "this cube"}".`);

    this.brand = brand;
    this.deviceName = device.name || null;
    this.inner = brand === "moyu" ? new MoyuCubeClient() : new GanCubeClient();
    console.log(`[PTS] smart cube "${device.name}" → ${brand} driver`);
    return withPickedDevice(device, () => this.inner.connect(handlers));
  }

  async disconnect() {
    await this.inner?.disconnect?.();
  }

  async requestFacelets() {
    return this.inner?.requestFacelets?.();
  }

  async markSolved() {
    return this.inner?.markSolved?.();
  }

  computeElapsedMs(samples) {
    return this.inner?.computeElapsedMs?.(samples) ?? null;
  }

  getPacketLog() {
    return this.inner?.getPacketLog?.() || [];
  }
}
