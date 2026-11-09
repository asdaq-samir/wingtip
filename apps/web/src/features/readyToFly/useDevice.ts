import { useEffect, useState } from "react";
import type { ReadyParts } from "./readyFacts";

/** The Battery Status API where the browser has it (Chromium); Safari and
 *  Firefox do not, and the battery is then left out, not guessed. */
interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
}

type Device = ReadyParts["device"];

/**
 * What the browser says of the device: its battery where it tells it,
 * and whether the page may know where it is (the Permissions API's
 * geolocation state). Each null where the browser does not say.
 */
export function useDevice(): Device & { askLocation: () => void } {
  const [device, setDevice] = useState<Device>({ batteryPct: null, charging: null, location: null });
  useEffect(() => {
    let gone = false;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    let battery: BatteryManager | null = null;
    const readBattery = () => {
      if (!gone && battery) setDevice((d) => ({ ...d, batteryPct: Math.round(battery!.level * 100), charging: battery!.charging }));
    };
    nav
      .getBattery?.()
      .then((b) => {
        battery = b;
        readBattery();
        b.addEventListener("levelchange", readBattery);
        b.addEventListener("chargingchange", readBattery);
      })
      .catch(() => undefined);
    let status: PermissionStatus | null = null;
    const readLocation = () => {
      if (!gone && status) setDevice((d) => ({ ...d, location: status!.state }));
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((s) => {
        status = s;
        readLocation();
        s.addEventListener("change", readLocation);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
      battery?.removeEventListener("levelchange", readBattery);
      battery?.removeEventListener("chargingchange", readBattery);
      status?.removeEventListener("change", readLocation);
    };
  }, []);
  // Asking for a position is what brings up the browser's own question;
  // the answer itself is not used here.
  const askLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      () => undefined,
      () => undefined,
    );
  return { ...device, askLocation };
}
