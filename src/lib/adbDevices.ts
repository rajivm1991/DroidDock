/**
 * Phone list shape, and a comparison so an unchanged poll can skip a re-render.
 * Only id, status, and model count. This does not talk to adb.
 */

export interface AdbDevice {
  id: string;
  status: string;
  model: string;
}

/** True when id/status/model lists match so a poll can skip a re-render. */
export function sameAdbDeviceList(a: AdbDevice[], b: AdbDevice[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (device, index) =>
      device.id === b[index].id &&
      device.status === b[index].status &&
      device.model === b[index].model,
  );
}
