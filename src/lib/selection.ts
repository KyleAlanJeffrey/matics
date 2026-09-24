import { useCallback } from "react";
import { useSearchParams } from "react-router";

// Selection lives in the URL so it survives switching views.
export function useSelection() {
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("selected");

  const select = useCallback(
    (id: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("selected", id);
          else next.delete("selected");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return { selectedId, select };
}
