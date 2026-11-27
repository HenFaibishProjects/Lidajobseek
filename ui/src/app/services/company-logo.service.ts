import { Injectable } from '@angular/core';

const LOOKUP_TIMEOUT_MS = 4500;
const METADATA_TIMEOUT_MS = 1000;
const IMAGE_TIMEOUT_MS = 1000;
const MAX_METADATA_BYTES = 256 * 1024;

@Injectable({ providedIn: 'root' })
export class CompanyLogoService {
  normalizeWebsite(value: string | undefined): URL | null {
    const website = value?.trim();
    if (!website) return null;

    const url = this.httpUrl(/^(?:[\w+.-]+:)?\/\//.test(website) ? website : `https://${website}`);
    if (!url || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]+$/i.test(url.hostname)) {
      return null;
    }

    url.hash = '';
    url.search = '';
    return url;
  }

  async resolve(website: URL, signal: AbortSignal): Promise<string | null> {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(LOOKUP_TIMEOUT_MS)]);
    const metadata = await this.readMetadata(website, deadline);
    const hosts = new Set([metadata.origin, website.origin]);
    const alternate = new URL(website);
    if (alternate.hostname.startsWith('www.')) {
      alternate.hostname = alternate.hostname.slice(4);
      hosts.add(alternate.origin);
    } else if (alternate.hostname.split('.').length === 2) {
      alternate.hostname = `www.${alternate.hostname}`;
      hosts.add(alternate.origin);
    }

    const icons = [...new Set(metadata.icons)].slice(0, 3);
    const declaredIcon = await this.firstLoadable(icons, deadline);
    if (declaredIcon || deadline.aborted) return declaredIcon;

    const favicons = [...hosts].map(origin => new URL('/favicon.ico', origin).href);
    const directIcon = await this.firstLoadable(favicons, deadline);
    if (directIcon || deadline.aborted) return directIcon;

    const googleIcons = [...hosts].map(origin => {
      const provider = new URL('https://www.google.com/s2/favicons');
      provider.search = new URLSearchParams({ domain: new URL(origin).hostname, sz: '128' }).toString();
      return provider.href;
    });
    return this.firstLoadable(googleIcons, deadline, true);
  }

  async validateManualUrl(value: string, signal: AbortSignal): Promise<string | null> {
    const url = this.httpUrl(value.trim());
    return url && await this.probe(url.href, signal, false) ? url.href : null;
  }

  private httpUrl(value: string, base?: string): URL | null {
    try {
      const url = new URL(value, base);
      return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
    } catch {
      return null;
    }
  }

  private async readMetadata(website: URL, signal: AbortSignal): Promise<{ origin: string; icons: string[] }> {
    let page = website;
    try {
      const response = await fetch(website.href, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(METADATA_TIMEOUT_MS)]),
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      page = this.httpUrl(response.url) ?? website;
      if (!response.ok || !response.headers.get('content-type')?.includes('text/html') || !response.body) {
        await response.body?.cancel();
        return { origin: page.origin, icons: [] };
      }

      // A detached template lets us inspect link declarations without loading page resources.
      const template = document.createElement('template');
      template.innerHTML = await this.readHead(response.body);
      const baseHref = template.content.querySelector('base[href]')?.getAttribute('href');
      const base = (baseHref && this.httpUrl(baseHref, page.href)?.href) || page.href;
      const icons = Array.from(template.content.querySelectorAll<HTMLLinkElement>(
        'link[rel~="icon" i][href], link[rel="apple-touch-icon" i][href], link[rel="apple-touch-icon-precomposed" i][href]',
      )).flatMap(link => {
        const url = this.httpUrl(link.getAttribute('href')!, base);
        if (!url) return [];
        const sizes = (link.getAttribute('sizes') ?? '').toLowerCase().split(/\s+/);
        const resolution = sizes.includes('any') || link.type === 'image/svg+xml'
          ? Infinity
          : Math.max(0, ...sizes.map(size => Number(size.match(/^(\d+)x\d+$/)?.[1]) || 0));
        return [{ url: url.href, resolution }];
      });
      icons.sort((a, b) => b.resolution - a.resolution);
      return { origin: page.origin, icons: icons.map(icon => icon.url) };
    } catch {
      // Most sites block cross-origin reads; direct image loads can still work.
      return { origin: page.origin, icons: [] };
    }
  }

  private async readHead(body: ReadableStream<Uint8Array>): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let html = '';
    let bytes = 0;

    try {
      while (bytes < MAX_METADATA_BYTES) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = value.subarray(0, MAX_METADATA_BYTES - bytes);
        bytes += chunk.length;
        html += decoder.decode(chunk, { stream: true });
        const endOfHead = html.search(/<\/head\s*>|<body[\s>]/i);
        if (endOfHead >= 0) return html.slice(0, endOfHead);
      }
      return html + decoder.decode();
    } finally {
      void reader.cancel().catch(() => undefined);
    }
  }

  private async firstLoadable(urls: string[], signal: AbortSignal, fromGoogle = false): Promise<string | null> {
    // Probe together, then respect the candidate order even when a later image responds first.
    const results = await Promise.all(urls.map(url => this.probe(url, signal, fromGoogle)));
    return urls[results.indexOf(true)] ?? null;
  }

  private probe(url: string, signal: AbortSignal, fromGoogle: boolean): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);

    return new Promise(resolve => {
      const image = new Image();
      const finish = (loadable: boolean, cancel = false) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        image.onload = image.onerror = null;
        if (cancel) image.removeAttribute('src');
        resolve(loadable);
      };
      const abort = () => finish(false, true);
      const timer = setTimeout(abort, IMAGE_TIMEOUT_MS);
      signal.addEventListener('abort', abort, { once: true });

      image.referrerPolicy = 'no-referrer';
      image.onload = () => {
        // Google can return a 16px generic icon instead of the requested 128px icon.
        const isGooglePlaceholder = fromGoogle && image.naturalWidth <= 16 && image.naturalHeight <= 16;
        finish(image.naturalWidth > 0 && image.naturalHeight > 0 && !isGooglePlaceholder);
      };
      image.onerror = () => finish(false);
      image.src = url;
    });
  }
}
