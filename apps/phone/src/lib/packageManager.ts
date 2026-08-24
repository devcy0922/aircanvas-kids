import type { GamePackageManifest, ArtworkPack, ThemePack, CachedGamePackage } from '@ht/protocol';

const CACHE_KEY = 'ht.game-package.v1';
const MANIFEST_URL = '/manifest.json'; // 콘텐츠 서버에서 제공

export interface PackageManagerCallbacks {
  onProgress?: (stage: string, percent: number) => void;
  onError?: (error: string) => void;
  onReady?: (pkg: CachedGamePackage) => void;
}

export class PackageManager {
  private callbacks: PackageManagerCallbacks;
  private cachedPackage: CachedGamePackage | null = null;

  constructor(callbacks: PackageManagerCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /** 캐시된 패키지 로드 또는 서버에서 다운로드 */
  async loadOrDownload(baseUrl: string): Promise<CachedGamePackage | null> {
    // 1. 로컬 캐시 확인
    const cached = this.loadFromCache();
    if (cached && await this.isVersionCurrent(baseUrl, cached.version)) {
      this.cachedPackage = cached;
      this.callbacks.onReady?.(cached);
      return cached;
    }

    // 2. 서버에서 매니페스트 다운로드
    this.callbacks.onProgress?.('매니페스트 다운로드', 10);
    const manifest = await this.fetchManifest(baseUrl);
    if (!manifest) return null;

    // 3. 에셋 다운로드 (썸네일 등)
    this.callbacks.onProgress?.('에셋 다운로드', 30);
    const artworksCache = await this.downloadArtworks(baseUrl, manifest);

    // 4. 캐시 저장
    const fullPackage: CachedGamePackage = {
      ...manifest,
      downloadedAt: Date.now(),
      artworksCache,
    };
    this.saveToCache(fullPackage);
    this.cachedPackage = fullPackage;
    this.callbacks.onProgress?.('완료', 100);
    this.callbacks.onReady?.(fullPackage);
    return fullPackage;
  }

  /** 강제 업데이트 체크 */
  async checkForUpdate(baseUrl: string): Promise<boolean> {
    const manifest = await this.fetchManifest(baseUrl);
    if (!manifest) return false;
    if (!this.cachedPackage) return true;
    return manifest.version !== this.cachedPackage.version;
  }

  getCachedPackage(): CachedGamePackage | null {
    return this.cachedPackage;
  }

  getTheme(themeId: string): ThemePack | undefined {
    return this.cachedPackage?.themes.find((t) => t.id === themeId);
  }

  getArtwork(artworkId: string): ArtworkPack | undefined {
    return this.cachedPackage?.artworksCache.get(artworkId);
  }

  getAllArtworks(): ArtworkPack[] {
    if (!this.cachedPackage) return [];
    const result: ArtworkPack[] = [];
    for (const theme of this.cachedPackage.themes) {
      result.push(...theme.artworks);
    }
    return result;
  }

  private async fetchManifest(baseUrl: string): Promise<GamePackageManifest | null> {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}${MANIFEST_URL}`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      this.callbacks.onError?.(`매니페스트 다운로드 실패: ${e}`);
      return null;
    }
  }

  private async isVersionCurrent(baseUrl: string, currentVersion: string): Promise<boolean> {
    const manifest = await this.fetchManifest(baseUrl);
    return manifest?.version === currentVersion;
  }

  private async downloadArtworks(baseUrl: string, manifest: GamePackageManifest): Promise<Map<string, ArtworkPack>> {
    const cache = new Map<string, ArtworkPack>();
    const allArtworks: ArtworkPack[] = [];
    for (const theme of manifest.themes) {
      allArtworks.push(...theme.artworks);
    }

    for (let i = 0; i < allArtworks.length; i++) {
      const art = allArtworks[i];
      try {
        // 썸네일 이미지 프리페치 (선택적)
        if (art.thumbnailUrl) {
          await fetch(`${baseUrl.replace(/\/$/, '')}${art.thumbnailUrl}`, { cache: 'force-cache' });
        }
        cache.set(art.id, art);
        this.callbacks.onProgress?.(`에셋 다운로드 (${i + 1}/${allArtworks.length})`, 30 + Math.floor((i / allArtworks.length) * 60));
      } catch {
        // 썸네일 실패해도 계속 진행
        cache.set(art.id, art);
      }
    }
    return cache;
  }

  private loadFromCache(): CachedGamePackage | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as CachedGamePackage;
      // Map 복원
      if (parsed.artworksCache && typeof parsed.artworksCache === 'object') {
        parsed.artworksCache = new Map(Object.entries(parsed.artworksCache));
      }
      return parsed;
    } catch {
      return null;
    }
  }

  private saveToCache(pkg: CachedGamePackage) {
    try {
      // Map을 일반 객체로 직렬화
      const toSave = {
        ...pkg,
        artworksCache: Object.fromEntries(pkg.artworksCache),
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(toSave));
    } catch {
      // 저장 공간 부족 등 무시
    }
  }

  clearCache() {
    localStorage.removeItem(CACHE_KEY);
    this.cachedPackage = null;
  }
}