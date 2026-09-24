import { describe, expect, it } from "vitest";
import { parseProto } from "./proto";

describe("parseProto", () => {
  it("reads messages, fields and the package version", () => {
    const schema = parseProto(`
      syntax = "proto3";
      package example.control.v1;
      import "google/protobuf/timestamp.proto";
      option java_package = "com.example";

      // A command for one motor.
      message MotorCommand {
        uint32 motor_id = 1;
        float target_rate = 2; /* per second */
        bool enabled = 3 [deprecated = true];
        repeated string tags = 5;
        map<string, int32> counters = 4;
        reserved 6, 7;
      }
    `);
    expect(schema.package).toBe("example.control.v1");
    expect(schema.version).toBe("v1");
    expect(schema.messages).toEqual([
      {
        name: "MotorCommand",
        fields: [
          { tag: 1, name: "motor_id", type: "uint32" },
          { tag: 2, name: "target_rate", type: "float" },
          { tag: 3, name: "enabled", type: "bool" },
          { tag: 4, name: "counters", type: "map<string, int32>" },
          { tag: 5, name: "tags", type: "string", repeated: true },
        ],
      },
    ]);
  });

  it("names nested messages after their parent and flattens oneofs", () => {
    const schema = parseProto(`
      syntax = "proto2";
      message Status {
        optional int32 code = 1;
        message Detail { required string text = 1; }
        enum Level { LOW = 0; HIGH = 1; }
        oneof payload {
          Detail detail = 2;
          .other.Blob blob = 3;
        }
      }
      service Control { rpc Send (Status) returns (Status) { option idempotent = true; } }
    `);
    expect(schema.version).toBeUndefined();
    expect(schema.messages.map((m) => m.name)).toEqual(["Status", "Status.Detail"]);
    expect(schema.messages[0].fields).toEqual([
      { tag: 1, name: "code", type: "int32" },
      { tag: 2, name: "detail", type: "Detail" },
      { tag: 3, name: "blob", type: ".other.Blob" },
    ]);
  });

  it("reports a field without a tag", () => {
    expect(() => parseProto("message Broken { uint32 id; }")).toThrow(/Expected "="/);
  });
});
