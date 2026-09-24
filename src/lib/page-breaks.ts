export interface Span {
  top: number;
  bottom: number;
}

// Page cuts, in CSS pixels from the top of `root`, that never split an element marked
// data-keep. A heading marked data-keep-with-next is kept with the block after it.
export function pageBreaks(total: number, pageHeight: number, blocks: Span[]): Span[] {
  const pages: Span[] = [];
  let start = 0;
  while (start < total - 1) {
    let end = start + pageHeight;
    if (end >= total) {
      pages.push({ top: start, bottom: total });
      break;
    }
    let moved = true;
    while (moved) {
      moved = false;
      for (const block of blocks) {
        if (block.top > start + 1 && block.top < end - 0.5 && block.bottom > end + 0.5) {
          end = block.top;
          moved = true;
        }
      }
    }
    // A block taller than a page has to be cut somewhere.
    if (end <= start + 1) end = start + pageHeight;
    pages.push({ top: start, bottom: end });
    start = end;
  }
  return pages;
}
