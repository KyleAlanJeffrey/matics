import { useStore } from "@xyflow/react";

// True once every node has a size. React Flow's fitView prop frames whatever is measured
// first, which can leave cards out, so framing waits for this. (useNodesInitialized also
// waits for handle bounds, which zones never get.)
export function useNodesMeasured() {
  return useStore((s) => s.nodeLookup.size > 0 && Array.from(s.nodeLookup.values()).every((node) => !!node.measured.width && !!node.measured.height));
}
