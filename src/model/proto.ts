import type { ProtoField } from "./types";

export interface ParsedMessage {
  // Nested messages are named "Outer.Inner".
  name: string;
  fields: ProtoField[];
}

export interface ParsedSchema {
  package?: string;
  // The trailing version segment of the package, e.g. "v1" for "acme.drive.v1".
  version?: string;
  messages: ParsedMessage[];
}

// Reads the message definitions out of a proto2 or proto3 file. Everything that is not a
// message field (services, enums, options, reserved ranges) is skipped, not validated.
export function parseProto(source: string): ParsedSchema {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expect = (value: string) => {
    const token = next();
    if (token !== value) throw new Error(`Expected "${value}" but found "${token ?? "end of file"}".`);
  };
  // Skips a statement up to its ";" or a block including everything nested in it.
  const skipStatement = () => {
    while (pos < tokens.length) {
      const token = next();
      if (token === ";") return;
      if (token === "{") {
        skipBlock();
        return;
      }
    }
  };
  const skipBlock = () => {
    let depth = 1;
    while (pos < tokens.length && depth > 0) {
      const token = next();
      if (token === "{") depth++;
      if (token === "}") depth--;
    }
  };

  const schema: ParsedSchema = { messages: [] };

  const readType = () => {
    if (peek() !== "map") return next();
    next();
    expect("<");
    const key = next();
    expect(",");
    const value = next();
    expect(">");
    return `map<${key}, ${value}>`;
  };

  const readField = (fields: ProtoField[]) => {
    let repeated = false;
    if (peek() === "repeated") {
      repeated = true;
      next();
    } else if (peek() === "optional" || peek() === "required") {
      next();
    }
    const type = readType();
    const name = next();
    expect("=");
    const tag = Number(next());
    if (peek() === "[") {
      while (pos < tokens.length && next() !== "]");
    }
    expect(";");
    if (!Number.isInteger(tag)) throw new Error(`Field "${name}" has no valid tag number.`);
    fields.push(repeated ? { tag, name, type, repeated } : { tag, name, type });
  };

  const readMessage = (prefix: string) => {
    const name = prefix + next();
    expect("{");
    const message: ParsedMessage = { name, fields: [] };
    schema.messages.push(message);
    while (pos < tokens.length && peek() !== "}") {
      const token = peek();
      if (token === "message") {
        next();
        readMessage(`${name}.`);
      } else if (token === "oneof") {
        next();
        next();
        expect("{");
        while (pos < tokens.length && peek() !== "}") {
          if (peek() === "option") skipStatement();
          else readField(message.fields);
        }
        expect("}");
      } else if (token === "enum" || token === "extend" || token === "option" || token === "reserved" || token === "extensions" || token === ";") {
        skipStatement();
      } else {
        readField(message.fields);
      }
    }
    expect("}");
    message.fields.sort((a, b) => a.tag - b.tag);
  };

  while (pos < tokens.length) {
    const token = next();
    if (token === "message") {
      readMessage("");
    } else if (token === "package") {
      schema.package = next();
      expect(";");
    } else if (token !== ";") {
      pos--;
      skipStatement();
    }
  }
  const last = schema.package?.split(".").pop();
  if (last && /^v\d+\w*$/i.test(last)) schema.version = last;
  return schema;
}

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  const pattern = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[A-Za-z_.][\w.]*|-?\d[\w.+-]*|[{}<>;=,[\]()]/g;
  for (const match of source.matchAll(pattern)) {
    if (!match[0].startsWith("//") && !match[0].startsWith("/*")) tokens.push(match[0]);
  }
  return tokens;
}
