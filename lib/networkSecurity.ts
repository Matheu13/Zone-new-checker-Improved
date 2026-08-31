import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const IPV4_BLOCKS: Array<[number, number]> = [
  [ipv4ToNumber("0.0.0.0"), 8],
  [ipv4ToNumber("10.0.0.0"), 8],
  [ipv4ToNumber("100.64.0.0"), 10],
  [ipv4ToNumber("127.0.0.0"), 8],
  [ipv4ToNumber("169.254.0.0"), 16],
  [ipv4ToNumber("172.16.0.0"), 12],
  [ipv4ToNumber("192.0.0.0"), 24],
  [ipv4ToNumber("192.0.2.0"), 24],
  [ipv4ToNumber("192.168.0.0"), 16],
  [ipv4ToNumber("198.18.0.0"), 15],
  [ipv4ToNumber("198.51.100.0"), 24],
  [ipv4ToNumber("203.0.113.0"), 24],
  [ipv4ToNumber("224.0.0.0"), 4],
  [ipv4ToNumber("240.0.0.0"), 4],
];

const IPV6_BLOCKS: Array<[bigint, number]> = [
  [ipv6ToBigInt("::"), 128],
  [ipv6ToBigInt("::1"), 128],
  [ipv6ToBigInt("fc00::"), 7],
  [ipv6ToBigInt("fe80::"), 10],
  [ipv6ToBigInt("ff00::"), 8],
  [ipv6ToBigInt("2001:db8::"), 32],
];

function ipv4ToNumber(ip: string): number {
  return ip.split(".").reduce((out, part) => (out * 256 + Number(part)) >>> 0, 0);
}

function ipv6ToBigInt(ip: string): bigint {
  let input = ip.toLowerCase();
  if (input.includes(".")) {
    const lastColon = input.lastIndexOf(":");
    const v4 = input.slice(lastColon + 1);
    const n = ipv4ToNumber(v4);
    input = `${input.slice(0, lastColon)}:${((n >>> 16) & 0xffff).toString(16)}:${(n & 0xffff).toString(16)}`;
  }

  const halves = input.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  const parts = halves.length === 2 ? [...left, ...Array(Math.max(0, missing)).fill("0"), ...right] : left;
  return parts.reduce((out, part) => (out << 16n) | BigInt(parseInt(part || "0", 16)), 0n);
}

function isInIpv4Block(value: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (value & mask) === (base & mask);
}

function isInIpv6Block(value: bigint, base: bigint, prefix: number): boolean {
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (base >> shift);
}

export function isPrivateOrReservedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const value = ipv4ToNumber(address);
    return IPV4_BLOCKS.some(([base, prefix]) => isInIpv4Block(value, base, prefix));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    if (normalized.startsWith("::ffff:")) {
      const mapped = normalized.slice(7);
      if (isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    const value = ipv6ToBigInt(address);
    if ((value >> 32n) === 0xffffn) {
      const mapped = Number(value & 0xffffffffn);
      return IPV4_BLOCKS.some(([base, prefix]) => isInIpv4Block(mapped, base, prefix));
    }
    return IPV6_BLOCKS.some(([base, prefix]) => isInIpv6Block(value, base, prefix));
  }
  return true;
}

export function isExactDomainOrSubdomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  const root = domain.toLowerCase().replace(/\.$/, "");
  return host === root || host.endsWith(`.${root}`);
}

export async function assertSafePublicUrl(input: string | URL): Promise<URL> {
  const url = input instanceof URL ? new URL(input) : new URL(input);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only HTTP and HTTPS URLs are supported.");
  }
  if (url.username || url.password) throw new Error("URLs containing embedded credentials are not supported.");

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Private or local network destinations are not allowed.");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) throw new Error("Private or reserved network destinations are not allowed.");
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("The destination hostname could not be resolved.");
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
    throw new Error("Private or reserved network destinations are not allowed.");
  }
  return url;
}
