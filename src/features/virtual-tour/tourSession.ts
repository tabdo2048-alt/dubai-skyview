const LAST_SCENE_PREFIX = "tour-last-scene:v1:";
const TOUR_ORIGIN_PREFIX = "tour-origin:v1:";

export interface TourReturnOrigin {
  slug: string;
  tourId: string;
  sceneId: string;
  savedAt: number;
}

function browserStorage(kind: "local" | "session"): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function parseOrigin(value: string | null): TourReturnOrigin | null {
  if (!value) return null;
  try {
    const candidate: unknown = JSON.parse(value);
    if (!candidate || typeof candidate !== "object") return null;
    const record = candidate as Record<string, unknown>;
    return typeof record.slug === "string" &&
      typeof record.tourId === "string" &&
      typeof record.sceneId === "string" &&
      typeof record.savedAt === "number"
      ? {
          slug: record.slug,
          tourId: record.tourId,
          sceneId: record.sceneId,
          savedAt: record.savedAt,
        }
      : null;
  } catch {
    return null;
  }
}

export function rememberTourScene(tourId: string, sceneId: string) {
  browserStorage("local")?.setItem(`${LAST_SCENE_PREFIX}${tourId}`, sceneId);
}

export function readRememberedTourScene(tourId: string): string | null {
  return browserStorage("local")?.getItem(`${LAST_SCENE_PREFIX}${tourId}`) ?? null;
}

export function rememberTourOrigin(childTourId: string, origin: Omit<TourReturnOrigin, "savedAt">) {
  browserStorage("session")?.setItem(
    `${TOUR_ORIGIN_PREFIX}${childTourId}`,
    JSON.stringify({ ...origin, savedAt: Date.now() } satisfies TourReturnOrigin),
  );
}

export function readTourOrigin(childTourId: string): TourReturnOrigin | null {
  return parseOrigin(
    browserStorage("session")?.getItem(`${TOUR_ORIGIN_PREFIX}${childTourId}`) ?? null,
  );
}
