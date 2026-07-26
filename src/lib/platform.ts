

export type OS = "mac" | "windows" | "linux";

export function detectOS(): OS {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  return "linux";
}
