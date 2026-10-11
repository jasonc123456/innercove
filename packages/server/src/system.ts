import { readFileSync } from "node:fs";
import { isIP } from "node:net";
import type { PrivacyStatus } from "@innercove/core";

export type EndpointClass = PrivacyStatus["model"]["endpointClass"];
export type Acceleration = PrivacyStatus["acceleration"];

/** A's fields of the privacy panel (plan §3c `GET /api/privacy-status`). */
export interface SystemInfo {
  endpointClass: EndpointClass;
  acceleration: Acceleration;
  memoryUsedGb(): number | null;
}

export interface SystemEnv {
  INFERENCE_PROVIDER?: string;
  LOCAL_AI_BASE_URL?: string;
  INFERENCE_ACCELERATION?: string;
}

const ACCELERATIONS = new Set<Acceleration>(["cuda", "vulkan", "cpu", "unknown"]);

export function systemInfo(env: SystemEnv): SystemInfo {
  const fake = env.INFERENCE_PROVIDER === "fake";
  const acceleration = env.INFERENCE_ACCELERATION as Acceleration | undefined;
  return {
    // The fake provider never leaves the process.
    endpointClass: fake ? "loopback" : endpointClass(env.LOCAL_AI_BASE_URL ?? "http://127.0.0.1:1234/v1"),
    // LM Studio's API doesn't report its runtime, so the deployment states it (GX10: CUDA 13 llama.cpp).
    acceleration: acceleration && ACCELERATIONS.has(acceleration) ? acceleration : "unknown",
    memoryUsedGb: () => readMemoryUsedGb(),
  };
}

/** Where chat text goes: this machine, the local network, or the internet (D24 custom servers). */
export function endpointClass(baseUrl: string): EndpointClass {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
  } catch {
    return "public";
  }
  if (host === "localhost" || host.endsWith(".localhost")) return "loopback";
  const family = isIP(host);
  if (family === 4) {
    const [a, b] = host.split(".").map(Number) as [number, number];
    if (a === 127) return "loopback";
    if (a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) return "lan";
    return "public";
  }
  if (family === 6) {
    if (host === "::1") return "loopback";
    if (/^f[cd]/.test(host) || /^fe[89ab]/.test(host)) return "lan";
    return "public";
  }
  // Single-label names (an ssh alias, "gx10") and mDNS/home-router suffixes resolve on the LAN.
  if (!host.includes(".") || /\.(local|lan|home\.arpa|internal)$/.test(host)) return "lan";
  return "public";
}

/**
 * System memory in use (MemTotal - MemAvailable). On the GB10 the GPU shares
 * this memory, so it includes the loaded model. Containers see the host's file.
 */
export function readMemoryUsedGb(path = "/proc/meminfo"): number | null {
  try {
    const info = readFileSync(path, "utf8");
    const kb = (key: string) => Number(new RegExp(`^${key}:\\s+(\\d+) kB`, "m").exec(info)?.[1] ?? NaN);
    const used = kb("MemTotal") - kb("MemAvailable");
    return Number.isFinite(used) && used >= 0 ? Math.round((used / 1024 ** 2) * 10) / 10 : null;
  } catch {
    return null;
  }
}
