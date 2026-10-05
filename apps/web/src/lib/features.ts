import { useQuery } from "@tanstack/react-query";
import type { Features, RunMode } from "@collab/shared";
import { api } from "./api";

/** Whether this server runs code (and the terminal): for everyone, after an access code, or not at all. */
export function useRunMode(): RunMode | undefined {
  const { data } = useQuery({
    queryKey: ["features"],
    queryFn: () => api.get<Features>("/features"),
    staleTime: 5 * 60_000,
  });
  return data?.run;
}
