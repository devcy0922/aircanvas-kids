import type { Artwork, Theme } from './types';
import { DINO_ARTWORKS } from './artworks/dino';
import { JUNGLE_ARTWORKS } from './artworks/jungle';
import { OCEAN_ARTWORKS } from './artworks/ocean';

export * from './types';

export const ALL_ARTWORKS: Artwork[] = [
  ...DINO_ARTWORKS,
  ...JUNGLE_ARTWORKS,
  ...OCEAN_ARTWORKS,
];

export function artworksByTheme(theme: Theme): Artwork[] {
  return ALL_ARTWORKS.filter((a) => a.theme === theme);
}
