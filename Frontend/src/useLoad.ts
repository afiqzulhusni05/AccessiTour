import { useEffect, useState } from "react";

/** Runs `load` once on mount. `data` is null until it resolves; `failed` is set if it rejects. */
export function useLoad<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    load().then((x) => live && setData(x)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, setData, failed };
}
