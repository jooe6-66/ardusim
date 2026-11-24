export type WiringImageFormat = 'svg' | 'png' | 'jpg';

const UNFLIP_SVG_CSS = `
.part-unflip-x text, .part-unflip-x .unflip-display { transform-box: fill-box; transform-origin: center; transform: scaleX(-1); }
.part-unflip-y text, .part-unflip-y .unflip-display { transform-box: fill-box; transform-origin: center; transform: scaleY(-1); }
.part-unflip-x.part-unflip-y text, .part-unflip-x.part-unflip-y .unflip-display { transform-box: fill-box; transform-origin: center; transform: scale(-1, -1); }
.part-unflip-x .unflip-display text, .part-unflip-y .unflip-display text { transform: none; }
.part-unflip-x text.unflip-rot90 { transform: scaleY(-1); }
.part-unflip-y text.unflip-rot90 { transform: scaleX(-1); }
.part-unflip-x.part-unflip-y text.unflip-rot90 { transform: scale(-1, -1); }
`;

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Exports the current workbench SVG circuit as a clean, cropped, standalone SVG, PNG, or JPG.
 * Resolves active theme CSS variables and strips interactive selection/handle overlays.
 */
export async function exportWiringImage(
  format: WiringImageFormat,
  slug: string
): Promise<boolean> {
  const worldG = document.querySelector<SVGGElement>('.canvas-svg g[data-export-world="true"]');
  if (!worldG) return false;

  const bbox = worldG.getBBox();
  if (!Number.isFinite(bbox.width) || bbox.width < 1 || bbox.height < 1) {
    return false;
  }

  const pad = 36;
  const vx = Math.floor(bbox.x - pad);
  const vy = Math.floor(bbox.y - pad);
  const vw = Math.ceil(bbox.width + pad * 2);
  const vh = Math.ceil(bbox.height + pad * 2);

  const rootStyle = getComputedStyle(document.documentElement);
  const cssVar = (name: string, fallback: string) =>
    rootStyle.getPropertyValue(name).trim() || fallback;

  const bgCanvas = cssVar('--bg-canvas', '#F4F1EA');
  const bgDot = cssVar('--bg-canvas-dot', '#D6D0C4');
  const bgSurface = cssVar('--bg-surface', '#FFFFFF');
  const textPrimary = cssVar('--text-primary', '#1C1917');
  const textMuted = cssVar('--text-muted', '#57534E');
  const primary = cssVar('--primary', '#0F6660');
  const accent = cssVar('--accent', '#D97706');
  const fontSans = cssVar('--font-sans', 'system-ui, -apple-system, sans-serif');
  const fontMono = cssVar('--font-mono', 'ui-monospace, SFMono-Regular, monospace');
  const fontDisplay = cssVar('--font-display', fontSans);

  const svgNS = 'http://www.w3.org/2000/svg';
  const outSvg = document.createElementNS(svgNS, 'svg');
  outSvg.setAttribute('xmlns', svgNS);
  outSvg.setAttribute('width', String(vw));
  outSvg.setAttribute('height', String(vh));
  outSvg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);

  const styleEl = document.createElementNS(svgNS, 'style');
  styleEl.textContent = `:root {
  --bg-canvas: ${bgCanvas};
  --bg-canvas-dot: ${bgDot};
  --bg-surface: ${bgSurface};
  --text-primary: ${textPrimary};
  --text-muted: ${textMuted};
  --primary: ${primary};
  --accent: ${accent};
  --font-sans: ${fontSans};
  --font-mono: ${fontMono};
  --font-display: ${fontDisplay};
}
${UNFLIP_SVG_CSS}`;
  outSvg.appendChild(styleEl);

  const defs = document.createElementNS(svgNS, 'defs');
  const pat = document.createElementNS(svgNS, 'pattern');
  pat.setAttribute('id', 'export-grid');
  pat.setAttribute('width', '24');
  pat.setAttribute('height', '24');
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('cx', '1.5');
  dot.setAttribute('cy', '1.5');
  dot.setAttribute('r', '1.1');
  dot.setAttribute('fill', bgDot);
  pat.appendChild(dot);
  defs.appendChild(pat);
  outSvg.appendChild(defs);

  const bgRect = document.createElementNS(svgNS, 'rect');
  bgRect.setAttribute('x', String(vx));
  bgRect.setAttribute('y', String(vy));
  bgRect.setAttribute('width', String(vw));
  bgRect.setAttribute('height', String(vh));
  bgRect.setAttribute('fill', bgCanvas);
  outSvg.appendChild(bgRect);

  const gridRect = document.createElementNS(svgNS, 'rect');
  gridRect.setAttribute('x', String(vx));
  gridRect.setAttribute('y', String(vy));
  gridRect.setAttribute('width', String(vw));
  gridRect.setAttribute('height', String(vh));
  gridRect.setAttribute('fill', 'url(#export-grid)');
  outSvg.appendChild(gridRect);

  const clone = worldG.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone.removeAttribute('data-export-world');
  for (const el of Array.from(clone.querySelectorAll('[data-export-ignore="true"]'))) {
    el.remove();
  }
  outSvg.appendChild(clone);

  const svgMarkup = new XMLSerializer().serializeToString(outSvg);
  const baseName = slug || 'ardusim';

  if (format === 'svg') {
    triggerBlobDownload(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }), `${baseName}-wiring.svg`);
    return true;
  }

  const maxSide = 4096;
  const scale = Math.min(2, maxSide / Math.max(vw, vh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(vw * scale));
  canvas.height = Math.max(1, Math.round(vh * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const svgBlobUrl = URL.createObjectURL(new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('SVG rasterization failed'));
      image.src = svgBlobUrl;
    });
    if (format === 'jpg') {
      ctx.fillStyle = bgCanvas;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(svgBlobUrl);
  }

  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, mime, format === 'jpg' ? 0.94 : undefined)
  );
  if (!blob) return false;
  triggerBlobDownload(blob, `${baseName}-wiring.${format}`);
  return true;
}
