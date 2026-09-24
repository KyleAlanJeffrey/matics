import { describe, expect, it } from "vitest";
import { channelKind, ioMapModules, parseIoMap, signalIssues, signalName } from "./io";
import type { IoSignal } from "./types";

const IO_MAP = `VAR_CONFIG
	Cyclic#5.::gIo.Inputs.SupplyLevel AT %IW."IO-1".AnalogInput02;
	Cyclic#1.::gIo.Outputs.Pump.Output_INT32767 AT %QW."IO-1".PWMOutput07;
	Cyclic#5.::gIo.Outputs.Pump.Period_us AT %QW."IO-1".PWMPeriod07;
	Cyclic#5.::gIo.Outputs.Pump.Current_mA AT %IW."IO-1".Current07;
	Cyclic#7.::gIo.Outputs.PumpDitherDisable AT %QX."IO-1".DitherDisable07;
	::Mux:Mux.A1.Output_BOOL AT %QX."DO-8".DigitalOutput03; (* no task class *)
	Cyclic#6.gIo.Inputs.Internal.ModuleOk AT %IX."DO-8".ModuleOk;
	Cyclic#7.::Mux:Mux.B2.Current_mA AT %IW."DO-8".Current09;
END_VAR
VAR_CONFIG
	Cyclic#1.gNet.Outputs.Heartbeat AT %QX."CPU".IF2.heartbeat;
END_VAR`;

describe("parseIoMap", () => {
  it("reads task, variable, direction, module and channel", () => {
    const file = parseIoMap(IO_MAP);
    expect(file.bindings[0]).toEqual({ task: "Cyclic#5", variable: "gIo.Inputs.SupplyLevel", direction: "input", module: "IO-1", channel: "AnalogInput02" });
    expect(file.bindings[5]).toEqual({ task: undefined, variable: "Mux:Mux.A1.Output_BOOL", direction: "output", module: "DO-8", channel: "DigitalOutput03" });
  });

  it("counts interface mappings apart and reports lines it cannot read", () => {
    const file = parseIoMap(`${IO_MAP}\nVAR_CONFIG\n\tnot a binding\nEND_VAR`);
    expect(file.bindings).toHaveLength(8);
    expect(file.interfaceBindings).toBe(1);
    expect(file.skipped).toEqual(["not a binding"]);
  });
});

describe("ioMapModules", () => {
  const modules = ioMapModules(parseIoMap(IO_MAP));

  it("groups bindings by module and names signals after their variables", () => {
    expect(modules.map((m) => m.name)).toEqual(["IO-1", "DO-8"]);
    expect(modules[0].signals.map((s) => [s.name, s.channel, s.kind, s.direction])).toEqual([
      ["SupplyLevel", "AnalogInput02", "ai", "input"],
      ["Pump", "PWMOutput07", "pwm", "output"],
    ]);
  });

  it("puts period, feedback and dither on the output with the same number", () => {
    const pump = modules[0].signals[1];
    expect(pump.settings.map((s) => [s.role, s.channel, s.direction, s.task])).toEqual([
      ["Period", "PWMPeriod07", "output", "Cyclic#5"],
      ["Feedback", "Current07", "input", "Cyclic#5"],
      ["Dither", "DitherDisable07", "output", "Cyclic#7"],
    ]);
  });

  it("keeps status and orphan settings as module bindings", () => {
    expect(modules[1].signals.map((s) => [s.name, s.channel, s.kind])).toEqual([
      ["Mux.A1", "DigitalOutput03", "do"],
      ["Internal.ModuleOk", "ModuleOk", "other"],
      ["Mux.B2", "Current09", "other"],
    ]);
  });
});

describe("signal helpers", () => {
  it("reads the channel kind from its name", () => {
    expect(channelKind("Encoder01")).toEqual({ kind: "encoder", direction: "input" });
    expect(channelKind("SupplyVoltageCpu")).toEqual({ kind: "other" });
  });

  it("strips namespace, task and type suffix from a variable", () => {
    expect(signalName("::gIo.Outputs.Fan.Output_INT32767", "PWMOutput01")).toBe("Fan");
    expect(signalName("Mux:Mux.X1_A_G4.Output_BOOL", "DigitalOutput35")).toBe("Mux.X1_A_G4");
    expect(signalName("gIo.Inputs.Lift[4].Position", "AnalogInput03")).toBe("Lift[4].Position");
    expect(signalName("", "AnalogInput03")).toBe("AnalogInput03");
  });

  it("lists what a physical signal still needs, and nothing for module bindings", () => {
    const base: IoSignal = { id: "s", moduleId: "m", name: "Level", channel: "AnalogInput01", kind: "ai", direction: "input", settings: [] };
    expect(signalIssues(base)).toEqual(["field-device", "pin", "range"]);
    expect(signalIssues({ ...base, kind: "di", channel: "DigitalInput01", fieldDeviceId: "d", pin: "X1.1" })).toEqual([]);
    expect(signalIssues({ ...base, kind: "other" })).toEqual([]);
  });
});
