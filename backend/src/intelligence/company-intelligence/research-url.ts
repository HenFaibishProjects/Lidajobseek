import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { addAbortListener } from 'node:events';
import { ResearchError } from './research-error';

const privateNetworks = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateNetworks.addSubnet(address, prefix, 'ipv4');
privateNetworks.addSubnet('2001:db8::', 32, 'ipv6');
privateNetworks.addSubnet('2001::', 23, 'ipv6');
privateNetworks.addSubnet('2002::', 16, 'ipv6');

export function isAllowedResearchUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    return (
      value.length <= 2048 &&
      ['https:', 'http:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.port &&
      !isIP(host.replace(/^\[|\]$/g, '')) &&
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host) &&
      !/(^|\.)(localhost|local|internal|lan|home|corp|onion|test|invalid|example)$/.test(
        host,
      )
    );
  } catch {
    return false;
  }
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !privateNetworks.check(address, 'ipv4');
  if (family !== 6) return false;
  const globalNetworks = new BlockList();
  globalNetworks.addSubnet('2000::', 3, 'ipv6');
  return (
    globalNetworks.check(address, 'ipv6') &&
    !privateNetworks.check(address, 'ipv6')
  );
}

export async function assertPublicResearchUrl(
  value: string,
  signal: AbortSignal,
): Promise<void> {
  if (!isAllowedResearchUrl(value))
    throw new ResearchError('EVIDENCE_INVALID', 'Source URL is not allowed');
  signal.throwIfAborted();
  const addresses = await new Promise<Awaited<ReturnType<typeof lookup>>[]>(
    (resolve, reject) => {
      const abortListener = addAbortListener(signal, () =>
        reject(new Error('URL verification aborted')),
      );
      lookup(new URL(value).hostname, { all: true })
        .then(resolve, reject)
        .finally(() => abortListener[Symbol.dispose]());
    },
  );
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new ResearchError(
      'EVIDENCE_INVALID',
      'Source resolves to a non-public address',
    );
  }
}
