import { AutoCubeClient, brandForDeviceName, pickerOptions } from "./autoCubeClient";
import { GanCubeClient } from "./ganCubeClient";
import { MoyuCubeClient } from "./moyuCubeClient";

jest.mock("gan-web-bluetooth", () => ({
  // A plain function: CRA resets jest.fn mocks before each test.
  connectGanCube: async () => {
    const device = await navigator.bluetooth.requestDevice({ filters: [{ namePrefix: "GAN" }] });
    return { device, events$: { subscribe: () => ({ unsubscribe() {} }) } };
  },
}));

describe("brandForDeviceName", () => {
  test("GAN names", () => {
    expect(brandForDeviceName("GAN12ui_1A2B")).toBe("gan");
    expect(brandForDeviceName("GANicV2")).toBe("gan");
    expect(brandForDeviceName("MG3-1234")).toBe("gan");
    expect(brandForDeviceName("AiCube-01")).toBe("gan");
  });

  test("MoYu names", () => {
    expect(brandForDeviceName("WCU_MY32_1A2B")).toBe("moyu");
    expect(brandForDeviceName("MY3201")).toBe("moyu");
    expect(brandForDeviceName("MHC-1")).toBe("moyu");
  });

  test("unknown", () => {
    expect(brandForDeviceName("Headphones")).toBe(null);
    expect(brandForDeviceName(undefined)).toBe(null);
  });
});

test("the picker lists every brand and asks for every brand's services", () => {
  const o = pickerOptions();
  const prefixes = o.filters.map((f) => f.namePrefix);
  expect(prefixes).toEqual(expect.arrayContaining(["GAN", "MG", "AiCube", "WCU_", "MY32", "MY33", "MHC"]));
  expect(o.optionalServices.length).toBeGreaterThanOrEqual(4);
  expect(new Set(o.optionalManufacturerData).size).toBe(o.optionalManufacturerData.length);
});

describe("AutoCubeClient", () => {
  let realBluetooth;
  beforeEach(() => {
    realBluetooth = navigator.bluetooth;
  });
  afterEach(() => {
    Object.defineProperty(navigator, "bluetooth", { value: realBluetooth, configurable: true });
  });

  function fakeBluetooth(device) {
    class Bluetooth {}
    const calls = [];
    Bluetooth.prototype.requestDevice = async (opts) => {
      calls.push(opts);
      return device;
    };
    const bt = new Bluetooth();
    Object.defineProperty(navigator, "bluetooth", { value: bt, configurable: true });
    return { bt, calls, proto: Bluetooth.prototype.requestDevice };
  }

  test("a GAN cube gets the GAN driver from one picker", async () => {
    const device = { name: "GAN12ui_77", addEventListener() {} };
    const { bt, calls, proto } = fakeBluetooth(device);
    const client = new AutoCubeClient();
    await client.connect({});
    expect(client.brand).toBe("gan");
    expect(client.inner).toBeInstanceOf(GanCubeClient);
    expect(client.inner.conn.device).toBe(device);
    // One real picker; the driver's own request was answered with the pick.
    expect(calls).toHaveLength(1);
    expect(client.label).toBe("GAN cube");
    // requestDevice is the browser's again.
    expect(Object.prototype.hasOwnProperty.call(bt, "requestDevice")).toBe(false);
    expect(bt.requestDevice).toBe(proto);
  });

  test("a MoYu cube gets the MoYu driver", async () => {
    const device = { name: "WCU_MY32_0001" };
    const { bt, calls } = fakeBluetooth(device);
    const spy = jest
      .spyOn(MoyuCubeClient.prototype, "connect")
      .mockImplementation(async function () {
        this.device = await navigator.bluetooth.requestDevice({});
        return true;
      });
    const client = new AutoCubeClient();
    await client.connect({});
    expect(client.brand).toBe("moyu");
    expect(client.inner).toBeInstanceOf(MoyuCubeClient);
    expect(client.inner.device).toBe(device);
    expect(calls).toHaveLength(1);
    expect(Object.prototype.hasOwnProperty.call(bt, "requestDevice")).toBe(false);
    spy.mockRestore();
  });

  test("an unknown device is refused", async () => {
    fakeBluetooth({ name: "Headphones" });
    await expect(new AutoCubeClient().connect({})).rejects.toThrow(/Headphones/);
  });
});
