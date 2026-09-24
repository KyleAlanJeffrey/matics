// Reads the parts of a Vector DBC file that describe who sends and receives which CAN
// identifiers: node list (BU_), messages (BO_), extra transmitters (BO_TX_BU_), receivers
// from the signal lines (SG_) and message comments (CM_ BO_). Payload layout is ignored.

export interface DbcMessage {
  id: number;
  name: string;
  transmitters: string[];
  receivers: string[];
  comment?: string;
}

export interface DbcFile {
  nodes: string[];
  messages: DbcMessage[];
}

const EXTENDED_FLAG = 0x80000000;
const ID_MASK = 0x1fffffff;
// Vector's placeholder for "no node" and its container for unattached signals.
const NO_NODE = "Vector__XXX";
const INDEPENDENT_MESSAGE = "VECTOR__INDEPENDENT_SIG_MSG";

export function parseDbc(text: string): DbcFile {
  const nodes: string[] = [];
  const messages = new Map<number, DbcMessage>();
  let current: DbcMessage | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const nodeList = line.match(/^BU_\s*:\s*(.*)$/);
    if (nodeList) {
      nodes.push(...nodeList[1].split(/\s+/).filter((n) => n && n !== NO_NODE));
      continue;
    }
    const message = line.match(/^BO_\s+(\d+)\s+([\w-]+)\s*:\s*\d+\s+([\w-]+)/);
    if (message) {
      const id = Number(message[1]) & (EXTENDED_FLAG | ID_MASK);
      if (message[2] === INDEPENDENT_MESSAGE) {
        current = undefined;
        continue;
      }
      current = { id: id & ID_MASK, name: message[2], transmitters: message[3] === NO_NODE ? [] : [message[3]], receivers: [] };
      messages.set(current.id, current);
      continue;
    }
    const signal = line.match(/^SG_\s+[\w-]+\s*(?:m\d+|M)?\s*:\s*.*"\s*([\w\s,-]*)$/);
    if (signal && current) {
      for (const receiver of signal[1].split(",").map((r) => r.trim())) {
        if (receiver && receiver !== NO_NODE && !current.receivers.includes(receiver)) current.receivers.push(receiver);
      }
      continue;
    }
    const extraTransmitters = line.match(/^BO_TX_BU_\s+(\d+)\s*:\s*([\w\s,-]+);/);
    if (extraTransmitters) {
      const target = messages.get(Number(extraTransmitters[1]) & ID_MASK);
      if (target) {
        for (const node of extraTransmitters[2].split(",").map((n) => n.trim())) {
          if (node && node !== NO_NODE && !target.transmitters.includes(node)) target.transmitters.push(node);
        }
      }
      continue;
    }
    if (!line.startsWith("SG_")) current = undefined;
  }

  // Comments may span lines, so they are read from the whole text.
  for (const match of text.matchAll(/CM_\s+BO_\s+(\d+)\s+"((?:[^"\\]|\\.)*)"\s*;/g)) {
    const target = messages.get(Number(match[1]) & ID_MASK);
    if (target) target.comment = match[2].replace(/\\"/g, '"').trim() || undefined;
  }

  return { nodes: Array.from(new Set(nodes)), messages: Array.from(messages.values()) };
}

// Every node named anywhere in the file, in order of first appearance.
export function dbcNodes(file: DbcFile): string[] {
  const seen = new Set(file.nodes);
  const all = [...file.nodes];
  for (const message of file.messages) {
    for (const node of [...message.transmitters, ...message.receivers]) {
      if (!seen.has(node)) {
        seen.add(node);
        all.push(node);
      }
    }
  }
  return all;
}

function normalize(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Guesses which party a DBC node stands for: an exact name match first, then a name that
// contains the node's name (node "MD200" for device "MD200 motor driver"), then the reverse.
export function matchNode(node: string, parties: { id: string; label: string }[]): string | undefined {
  const needle = normalize(node);
  if (!needle) return undefined;
  const exact = parties.find((p) => normalize(p.label) === needle);
  if (exact) return exact.id;
  const containing = parties.filter((p) => normalize(p.label).includes(needle));
  if (containing.length === 1) return containing[0].id;
  const contained = parties.filter((p) => needle.includes(normalize(p.label)) && normalize(p.label).length >= 3);
  return contained.length === 1 ? contained[0].id : undefined;
}
