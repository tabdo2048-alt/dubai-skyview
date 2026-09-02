import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMapConfig } from "@/lib/config.functions";

export function useMapConfig() {
  const fn = useServerFn(getMapConfig);
  return useQuery({
    queryKey: ["map-config"],
    queryFn: () => fn(),
    staleTime: Infinity,
  });
}
