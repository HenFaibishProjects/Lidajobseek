import { fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { CompanyLogoService } from './company-logo.service';

describe('CompanyLogoService', () => {
  const page = 'https://www.example.com/jobs';
  const direct = 'https://www.example.com/favicon.ico';
  let service: CompanyLogoService;
  let abort: AbortController;
  let fetchPage: jasmine.Spy;
  let requested: string[];
  let images: Map<string, number>;

  beforeEach(() => {
    service = new CompanyLogoService();
    abort = new AbortController();
    requested = [];
    images = new Map();
    fetchPage = spyOn(window, 'fetch').and.rejectWith(new TypeError('CORS'));
    spyOn(window, 'Image').and.callFake(function () {
      const image = {
        naturalWidth: 0, naturalHeight: 0,
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
        removeAttribute: jasmine.createSpy('removeAttribute'),
        set src(url: string) {
          requested.push(url);
          const size = images.get(url);
          if (size === 0) return;
          void Promise.resolve().then(() => {
            if (size) {
              this.naturalWidth = this.naturalHeight = size;
              this.onload?.();
            } else {
              this.onerror?.();
            }
          });
        },
      };
      return image as unknown as HTMLImageElement;
    });
  });

  it('normalizes domains, paths and explicit HTTP URLs and rejects non-web URLs', () => {
    expect(service.normalizeWebsite(' WWW.Example.COM/jobs/?token=value#top ')?.href).toBe(
      'https://www.example.com/jobs/'
    );
    expect(service.normalizeWebsite('http://example.com/')?.href).toBe('http://example.com/');
    expect(service.normalizeWebsite('https://user:pass@example.com')).toBeNull();
    expect(service.normalizeWebsite('javascript:alert(1)')).toBeNull();
    expect(service.normalizeWebsite('notadomain')).toBeNull();
  });

  it('prefers a larger declared icon and handles redirects and relative URLs', async () => {
    const url = 'https://brand.example/careers/assets/logo.png';
    const response = new Response(
      '<head><link rel="icon" sizes="16x16" href="/small.png">' +
      '<link rel="apple-touch-icon" sizes="180x180" href="../assets/logo.png"></head>',
      { headers: { 'Content-Type': 'text/html' } },
    );
    Object.defineProperty(response, 'url', { value: 'https://brand.example/careers/jobs/' });
    fetchPage.and.resolveTo(response);
    images.set('https://brand.example/small.png', 16);
    images.set(url, 180);

    expect(await service.resolve(new URL(page), abort.signal)).toBe(url);
    expect(requested).toEqual([
      'https://brand.example/careers/assets/logo.png', 'https://brand.example/small.png',
    ]);
  });

  it('accepts a valid 16px favicon even when metadata is blocked by CORS', async () => {
    images.set(direct, 16);
    expect(await service.resolve(new URL(page), abort.signal)).toBe(direct);
    expect(requested.some(url => url.includes('google.com'))).toBeFalse();
  });

  it('uses Google after direct icons fail and skips its generic icon', async () => {
    const generic = 'https://www.google.com/s2/favicons?domain=www.example.com&sz=128';
    const logo = 'https://www.google.com/s2/favicons?domain=example.com&sz=128';
    images.set(generic, 16);
    images.set(logo, 128);
    expect(await service.resolve(new URL(page), abort.signal)).toBe(logo);
    expect(requested.indexOf(direct)).toBeLessThan(requested.indexOf(logo));
  });

  it('validates a direct manual image URL without a website lookup', async () => {
    images.set(direct, 16);
    expect(await service.validateManualUrl(direct, abort.signal)).toBe(direct);
    expect(await service.validateManualUrl('data:text/html,hello', abort.signal)).toBeNull();
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('gives up on unavailable images after the per-image timeout', fakeAsync(() => {
    const completed = jasmine.createSpy('completed');
    images.set(direct, 0);
    void service.resolve(new URL(page), abort.signal).then(completed);

    flushMicrotasks();
    expect(completed).not.toHaveBeenCalled();
    tick(1000);
    expect(completed).toHaveBeenCalledOnceWith(null);
  }));
});
