import { isLinkLike } from "@/lib/links";
import { DEFAULT_CARD_PROPS, type DeviceInstance } from "@/model/types";

export const CARD_SERVICE_ROWS = 2;

// Links belong on the documentation page, so they never draw on the card whatever the setting.
export function canShowOnCard(value: string) {
  return !isLinkLike(value);
}

export function isShownOnCard(device: DeviceInstance, key: string) {
  return canShowOnCard(device.props[key] ?? "") && (device.card?.props ?? DEFAULT_CARD_PROPS).includes(key);
}

export function cardProps(device: DeviceInstance): [string, string][] {
  return Object.entries(device.props).filter(([key]) => isShownOnCard(device, key));
}
