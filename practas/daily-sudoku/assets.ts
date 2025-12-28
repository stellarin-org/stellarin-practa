/**
 * Asset Resolver for Practa
 * 
 * Register your assets here and use assets("key") to get URLs.
 * NEVER use require() directly in component code.
 */

type AssetSource = number | { uri: string };

const localAssets = {} as const;

export type AssetKey = keyof typeof localAssets;

export const assets = (key: AssetKey): string => {
  const asset = localAssets[key] as AssetSource | undefined;
  if (asset === undefined) {
    console.warn(`[Practa Assets] Asset "${String(key)}" not found.`);
    return "";
  }
  if (typeof asset === "object" && "uri" in asset) {
    return asset.uri;
  }
  if (typeof asset === "number") {
    return String(asset);
  }
  return "";
};
