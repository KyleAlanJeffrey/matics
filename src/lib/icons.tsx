import { Camera, Car, Cpu, FileText, Gauge, Lightbulb, Network, NotebookPen, BookOpen } from "lucide-react";
import type { DeviceCategory, DocumentKind } from "@/model/types";

export function categoryIcon(category: DeviceCategory) {
  switch (category) {
    case "controller":
      return Cpu;
    case "sensor":
      return Gauge;
    case "camera":
      return Camera;
    case "actuator":
      return Lightbulb;
    case "vehicle":
      return Car;
    default:
      return Network;
  }
}

export function documentIcon(kind: DocumentKind) {
  switch (kind) {
    case "pdf":
      return FileText;
    case "guide":
      return BookOpen;
    default:
      return NotebookPen;
  }
}
