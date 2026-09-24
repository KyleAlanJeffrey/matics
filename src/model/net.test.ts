import { describe, expect, it } from "vitest";
import { parseIoMap } from "./io";
import { ioMapInterfaces, symbolName } from "./net";

describe("ioMapInterfaces", () => {
  it("groups interface bindings by module and interface in file order", () => {
    const file = parseIoMap(`VAR_CONFIG
	Cyclic#1.gNet.Outputs.PumpSpeed AT %QW."CPU".IF2.pump_speed;
	Cyclic#8.::gNet.FlowSetpoint AT %QW."CPU".IF2.flow_setpoint;
	gNet.Inputs.Level AT %IW."CPU".IF3.tank_level;
	Cyclic#5.::gIo.Inputs.Supply AT %IW."IO-1".AnalogInput01;
END_VAR`);
    const interfaces = ioMapInterfaces(file);
    expect(interfaces.map((i) => [i.module, i.name, i.mappings.length])).toEqual([
      ["CPU", "IF2", 2],
      ["CPU", "IF3", 1],
    ]);
    expect(interfaces[0].mappings[1]).toEqual({ name: "Flow setpoint", symbol: "flow_setpoint", direction: "output", variable: "gNet.FlowSetpoint", task: "Cyclic#8" });
    expect(interfaces[1].mappings[0]).toMatchObject({ direction: "input", task: undefined });
  });
});

describe("symbolName", () => {
  it("turns a symbol into words", () => {
    expect(symbolName("pump_speed")).toBe("Pump speed");
    expect(symbolName("Speed")).toBe("Speed");
    expect(symbolName("__")).toBe("__");
  });
});
