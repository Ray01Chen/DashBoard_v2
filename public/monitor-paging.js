/** Paging is independent of data polling and alert-reason rotation. A manual
 * action starts a fresh dwell, so the next timer tick cannot undo that action. */
export const pageSize = 7;
export class MonitorPaging {
  constructor() {
    this.page = 0;
    this.pages = 1;
    this.signature = '';
    this.nextAt = 0;
    this.interval = null;
  }
  update(keys, scope, seconds, now) {
    const signature = JSON.stringify([scope, keys]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.page = 0;
      this.nextAt = now + seconds * 1000;
    }
    if (this.interval !== seconds) {
      this.interval = seconds;
      this.nextAt = now + seconds * 1000;
    }
    this.pages = Math.max(1, Math.ceil(keys.length / pageSize));
    this.page = Math.min(this.page, this.pages - 1);
    return this.page;
  }
  select(page, now) {
    this.page = Math.max(0, Math.min(this.pages - 1, page));
    this.nextAt = now + (this.interval || 0) * 1000;
    return this.page;
  }
  tick(now, paused = false) {
    if (paused) {
      this.nextAt = now + (this.interval || 0) * 1000;
      return false;
    }
    if (!this.interval || this.pages < 2 || now < this.nextAt) return false;
    this.page = (this.page + 1) % this.pages;
    this.nextAt = now + this.interval * 1000;
    return true;
  }
}
