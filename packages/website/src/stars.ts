import { createServerFn } from "@tanstack/react-start";

interface GitHubRepo {
  stargazers_count: number;
}

function formatStars(count: number): string {
  if (count < 1000) return String(count);
  const k = count / 1000;
  return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
}

const GITHUB_REPO_URL = "https://api.github.com/repos/getpaseo/paseo";
const STAR_REFRESH_MS = 60_000;

let cachedStars = "";
let cachedStarsAt = 0;
let refreshStarsPromise: Promise<void> | null = null;

async function fetchStarCount(): Promise<string> {
  try {
    const res = await fetch(GITHUB_REPO_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "paseo-website",
      },
      cf: {
        cacheEverything: true,
        cacheTtl: 60,
        cacheKey: "github-repo-stars",
      },
    } as RequestInit);
    if (!res.ok) return "";

    const repo = (await res.json()) as GitHubRepo;
    return formatStars(repo.stargazers_count);
  } catch {
    return "";
  }
}

function refreshStarCount(): Promise<void> {
  refreshStarsPromise ??= fetchStarCount()
    .then((stars) => {
      if (stars) {
        cachedStars = stars;
        cachedStarsAt = Date.now();
      }
      return undefined;
    })
    .finally(() => {
      refreshStarsPromise = null;
    });

  return refreshStarsPromise;
}

export const getStarCount = createServerFn({ method: "GET" }).handler(async () => {
  if (Date.now() - cachedStarsAt > STAR_REFRESH_MS) {
    void refreshStarCount();
  }

  return { stars: cachedStars };
});
