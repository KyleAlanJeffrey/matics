import type { CanFrame, Project } from "./types";

export function frameIdCount(frame: Pick<CanFrame, "startId" | "endId">): number {
  return Math.max(0, frame.endId - frame.startId + 1);
}

export function formatCanId(id: number): string {
  return "0x" + id.toString(16).toUpperCase().padStart(3, "0");
}

export function formatFrameRange(frame: Pick<CanFrame, "startId" | "endId">): string {
  return frame.startId === frame.endId ? formatCanId(frame.startId) : `${formatCanId(frame.startId)} - ${formatCanId(frame.endId)}`;
}

// Accepts "0x1D1", "1D1" or "465". Returns undefined for anything else.
export function parseCanId(text: string): number | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const hex = /^0x[0-9a-f]+$/i.test(trimmed) ? parseInt(trimmed.slice(2), 16) : /^[0-9a-f]+$/i.test(trimmed) && /[a-f]/i.test(trimmed) ? parseInt(trimmed, 16) : /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
  return Number.isFinite(hex) && hex >= 0 && hex <= 0x1fffffff ? hex : undefined;
}

// A frame party is a placed device or, for "all copies" of a product, a preset.
export function partyLabel(project: Project, partyId: string): string {
  const device = project.devices[partyId];
  if (device) return device.name;
  const preset = project.presets[partyId];
  if (preset) {
    const copies = Object.values(project.devices).filter((d) => d.presetId === partyId).length;
    return copies > 1 ? `${preset.name} (all ${copies})` : preset.name;
  }
  return "Unknown";
}

export function partyPresetId(project: Project, partyId: string): string | undefined {
  return project.devices[partyId]?.presetId ?? (project.presets[partyId] ? partyId : undefined);
}

export interface PartyTotals {
  partyId: string;
  txIds: number;
  rxIds: number;
  txFrames: CanFrame[];
  rxFrames: CanFrame[];
}

// Identifier totals per party, in order of first appearance. Counts are distinct CAN IDs,
// not message rates.
export function partyTotals(project: Project): PartyTotals[] {
  const totals = new Map<string, PartyTotals>();
  const get = (partyId: string) => {
    if (!totals.has(partyId)) totals.set(partyId, { partyId, txIds: 0, rxIds: 0, txFrames: [], rxFrames: [] });
    return totals.get(partyId)!;
  };
  for (const frame of Object.values(project.frames)) {
    const count = frameIdCount(frame);
    const sender = get(frame.senderId);
    sender.txIds += count;
    sender.txFrames.push(frame);
    for (const receiverId of frame.receiverIds) {
      const receiver = get(receiverId);
      receiver.rxIds += count;
      receiver.rxFrames.push(frame);
    }
  }
  return Array.from(totals.values());
}

export interface FrameFlow {
  fromId: string;
  toId: string;
  ids: number;
  frames: number;
}

// Directed producer -> consumer pairs with the identifiers that travel each way.
export function frameFlows(project: Project): FrameFlow[] {
  const flows = new Map<string, FrameFlow>();
  for (const frame of Object.values(project.frames)) {
    for (const receiverId of frame.receiverIds) {
      const key = `${frame.senderId}>${receiverId}`;
      const flow = flows.get(key) ?? { fromId: frame.senderId, toId: receiverId, ids: 0, frames: 0 };
      flow.ids += frameIdCount(frame);
      flow.frames += 1;
      flows.set(key, flow);
    }
  }
  return Array.from(flows.values());
}

// Distinct identifiers across frames: overlapping ranges count once.
export function totalFrameIds(frames: CanFrame[]): number {
  const ranges = frames.filter((f) => f.endId >= f.startId).map((f) => [f.startId, f.endId]).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let current: number[] | undefined;
  for (const range of ranges) {
    if (current && range[0] <= current[1] + 1) {
      current[1] = Math.max(current[1], range[1]);
    } else {
      if (current) total += current[1] - current[0] + 1;
      current = [...range];
    }
  }
  if (current) total += current[1] - current[0] + 1;
  return total;
}

// Frames a party sends or receives, for the device inspector and notes.
export function framesForParty(project: Project, partyId: string): { tx: CanFrame[]; rx: CanFrame[] } {
  const presetId = partyPresetId(project, partyId);
  const matches = (id: string) => id === partyId || (presetId !== undefined && id === presetId && project.presets[partyId] === undefined);
  const frames = Object.values(project.frames);
  return {
    tx: frames.filter((f) => matches(f.senderId)),
    rx: frames.filter((f) => f.receiverIds.some(matches)),
  };
}

// Sender and receiver choices: every placed device, plus each product with several
// copies as "all N" so a range can belong to the whole group.
export function partyOptions(project: Project): { id: string; label: string }[] {
  const options: { id: string; label: string }[] = [];
  const counts = new Map<string, number>();
  for (const device of Object.values(project.devices)) counts.set(device.presetId, (counts.get(device.presetId) ?? 0) + 1);
  for (const [presetId, count] of counts) {
    if (count > 1 && project.presets[presetId] && !project.devices[presetId]) options.push({ id: presetId, label: partyLabel(project, presetId) });
  }
  for (const device of Object.values(project.devices)) options.push({ id: device.id, label: device.name });
  return options;
}
