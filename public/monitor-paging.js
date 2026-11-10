/** Paging is independent of data polling and alert-reason rotation. A manual
 * action starts a fresh dwell, so the next timer tick cannot undo that action. */
export const pageSize = 7;
/** Fit complete readable rows in the measured viewport budget. Width affects
 * row height through CSS; paging never changes text size to fit another row. */
export function fitMonitorPage(height, rowHeight, gap = 6) {
  if (!(height > 0) || !(rowHeight > 0)) return 1;
  return Math.max(1, Math.min(pageSize, Math.floor((height + gap) / (rowHeight + gap))));
}
export class MonitorPaging {
  constructor() {
    this.page = 0;
    this.size = pageSize;
    this.paused = false;
    this.pages = 1;
    this.signature = '';
    this.nextAt = 0;
    this.interval = null;
  }
  update(keys, scope, seconds, now, size = pageSize) {
    size = Math.max(1, Math.min(pageSize, size));
    let first = this.page * this.size;
    const signature = JSON.stringify([scope, keys]);
    if (signature !== this.signature) {
      this.signature = signature;
      first = 0;
      this.page = 0;
      this.nextAt = now + seconds * 1000;
    }
    if (this.interval !== seconds) {
      this.interval = seconds;
      this.nextAt = now + seconds * 1000;
    }
    if (this.size !== size) {
      this.page = Math.floor(first / size);
      this.size = size;
      this.nextAt = now + seconds * 1000;
    }
    this.pages = Math.max(1, Math.ceil(keys.length / size));
    this.page = Math.min(this.page, this.pages - 1);
    return this.page;
  }
  select(page, now) {
    this.page = Math.max(0, Math.min(this.pages - 1, page));
    this.nextAt = now + (this.interval || 0) * 1000;
    return this.page;
  }
  togglePause(now) {
    this.paused = !this.paused;
    this.nextAt = now + (this.interval || 0) * 1000;
    return this.paused;
  }
  tick(now, paused = false) {
    if (paused || this.paused) {
      this.nextAt = now + (this.interval || 0) * 1000;
      return false;
    }
    if (!this.interval || this.pages < 2 || now < this.nextAt) return false;
    this.page = (this.page + 1) % this.pages;
    this.nextAt = now + this.interval * 1000;
    return true;
  }
}
