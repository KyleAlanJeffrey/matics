import { beforeEach, describe, expect, it } from "vitest";
import { sampleProject } from "@/model/sample-project";
import { useProjectStore } from "@/store/project-store";
import { cardProps, isShownOnCard } from "./card-display";

const store = () => useProjectStore.getState();
const computer = () => store().project.devices.computer;

describe("card display", () => {
  beforeEach(() => useProjectStore.setState({ project: structuredClone(sampleProject) }));

  it("stores only settings that differ from the defaults", () => {
    store().setCardDisplay("computer", { layout: "detailed", picture: "small" });
    expect(computer().card).toEqual({ layout: "detailed", picture: "small" });

    store().setCardDisplay("computer", { services: "all" });
    expect(computer().card?.services).toBe("all");

    store().setCardDisplay("computer", { layout: "overview", picture: "large", props: ["ip"], services: "first" });
    expect(computer()).not.toHaveProperty("card");
  });

  it("shows only the IP address until other properties are picked", () => {
    store().setDeviceProp("computer", "firmware", "1.2");
    expect(cardProps(computer()).map(([key]) => key)).toEqual(["ip"]);

    store().setCardDisplay("computer", { props: ["ip", "firmware"] });
    expect(isShownOnCard(computer(), "firmware")).toBe(true);

    store().removeDeviceProp("computer", "firmware");
    expect(computer()).not.toHaveProperty("card");
  });

  it("never shows links on the card", () => {
    store().setDeviceProp("computer", "repo", "https://example.com/repo");
    store().setCardDisplay("computer", { props: ["ip", "repo"] });
    expect(isShownOnCard(computer(), "repo")).toBe(false);
  });
});
