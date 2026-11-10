// The failed1 bull (reference-mobs/ref1.py), re-authored as integer boxes + guide-voxel ops.
// Authoring frame: x right, y forward, z up, 1 voxel = 1/16 block. Bottom of hooves at z = 0.
// Later writes overwrite earlier ones, so legs are written first and the torso covers their buried tops.
import { GridBuilder } from './grid.js';
import { stack, frustum, chain } from './ops.js';

function build() {
  const b = new GridBuilder();

  // Legs: 6 wide at the top, 4 wide at the hoof; the buried top reaches inside the torso.
  for (const [y0, y1] of [[6, 12], [-10, -4]]) {
    for (const sx of [1, -1]) {
      const [x0, x1] = sx > 0 ? [1, 7] : [-7, -1];
      frustum(b, 'leg', [x0, y0, 2], [x1, y1, 11], 2, -1, 1);
      b.box('leg', [sx > 0 ? x0 : x0 + 1, y0, 11], [sx > 0 ? x1 - 1 : x1, y1, 14]);
      b.box('hoof', [x0 + 1, y0 + 1, 0], [x1 - 1, y1 - 1, 2]);
    }
  }

  // Torso, narrower at the rump; the hump is a symmetric mound instead of failed1's one-sided slope.
  frustum(b, 'body', [-7, -12, 10], [7, 12, 23], 1, -1, 1);
  stack(b, 'hump', [-5, 2], [5, 10], 23, [0, 1, 2, 3]);
  b.box('body', [-4, 11, 12], [4, 16, 22]);                   // neck

  // Head: wedge-shaped skull + muzzle + poll (the extra row between the horns that becomes a brow)
  frustum(b, 'head', [-5, 15, 11], [5, 24, 20], 1, 1, 1);
  b.box('head', [-4, 16, 20], [4, 19, 21]);
  b.box('muzzle', [-4, 24, 11], [4, 28, 17]);
  b.boxM('ear', [5, 16, 17], [8, 18, 19]);

  // Horns: out, then up (stepped cube chain; smoothing rounds the steps)
  chain(b, 'hornbase', [[5, 19, 19, 4], [8, 19, 19, 3]], { mirror: true });
  chain(b, 'horn', [[9, 19, 19.5, 3], [12, 19.5, 20.5, 3], [14, 20, 23, 2], [15, 21, 26, 2], [15.5, 22, 29, 1]], { mirror: true });

  // Face details are flush layers inside the head/muzzle shell, not protruding slabs.
  b.boxM('white', [1, 23, 17], [4, 24, 19]);
  b.boxM('black', [1, 23, 17], [2, 24, 18]);
  b.boxM('black', [1, 27, 14], [2, 28, 15]);
  b.box('black', [-2, 27, 12], [2, 28, 13]);

  b.box('dark', [-1, -14, 13], [1, -12, 23]);                 // tail
  b.box('black', [-1, -14, 10], [1, -12, 13]);

  return b.build();
}

const styles = {
  body:     { color: '#5a3a22', mat: 'deform = 3 1 0.8' },
  hump:     { color: '#4b2f1b', mat: 'deform = 6 1 0.85' },
  head:     { color: '#5a3a22', mat: 'deform = 2 1 0.8' },
  muzzle:   { color: '#8b6a4c', mat: 'deform = 2 1 0.8' },
  ear:      { color: '#8b6a4c', mat: 'deform = 1' },
  hornbase: { color: '#8f7a5c', mat: 'deform = 2 1 0.7' },
  horn:     { color: '#e8dfc4', mat: 'deform = 2 1 0.7' },
  white:    { color: '#f2f2f2', mat: '' },
  black:    { color: '#15110e', mat: '' },
  dark:     { color: '#3e2616', mat: 'deform = 1' },
  leg:      { color: '#4a2e1a', mat: 'deform = 2 1 0.8, clamp = -y' },
  hoof:     { color: '#b89e98', mat: 'clamp = -y' },
};

export const bull = { name: 'Bull (integer boxes + guide ops)', build, styles };
