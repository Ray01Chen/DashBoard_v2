import { setPersonalOrders } from './list-order.js';

/** Pointer handles support mouse and touch; arrow controls also support keyboard.
 * Serial saves coalesce rapid moves and keep failed input available for retry. */
export function createPersonalOrderUI({ api, t, esc, onChange }) {
  const panel = document.querySelector('#personal-order-panel');
  let snapshot = null,
    selected = 'units',
    saving = false,
    dirty = false,
    error = '',
    drag = null;
  function apply() {
    setPersonalOrders(snapshot?.lists, snapshot?.orders);
  }
  async function load() {
    snapshot = await api('/api/preferences/lists');
    dirty = false;
    error = '';
    apply();
    render();
  }
  function render() {
    if (!snapshot || drag) return;
    const focus = panel.contains(document.activeElement)
      ? {
          id: document.activeElement.closest('[data-order-id]')?.dataset.orderId,
          move: document.activeElement.dataset.orderMove,
          list: document.activeElement.matches('[data-order-list]'),
        }
      : null;
    const scroll = panel.querySelector('ol')?.scrollTop || 0;
    const orders = snapshot.orders[selected];
    const labels = new Map(snapshot.lists[selected].map((item) => [item.id, item.label]));
    panel.innerHTML = `<div class="personal-order-heading"><strong>${esc(t('personalOrder'))}</strong><button type="button" class="icon-button" data-order-close aria-label="${esc(t('close'))}">×</button></div>
      <p>${esc(t('personalOrderHelp'))}</p><select data-order-list aria-label="${esc(t('personalOrder'))}">${Object.keys(
        snapshot.lists,
      )
        .map(
          (id) =>
            `<option value="${id}" ${id === selected ? 'selected' : ''}>${esc(t('order_' + id))} (${snapshot.lists[id].length})</option>`,
        )
        .join('')}</select>
      <ol class="personal-order-items">${orders.items.map((id, index) => `<li data-order-id="${esc(id)}"><button type="button" class="order-handle" aria-label="${esc(t('personalOrder') + ': ' + labels.get(id))}">⠿</button><span>${esc(labels.get(id))}</span><button type="button" data-order-move="-1" ${index ? '' : 'disabled'} aria-label="${esc(t('previous'))}">↑</button><button type="button" data-order-move="1" ${index < orders.items.length - 1 ? '' : 'disabled'} aria-label="${esc(t('next'))}">↓</button></li>`).join('')}</ol>
      <div class="order-save-state" role="status">${esc(error || t(saving || dirty ? 'orderSaving' : 'orderSaved'))}</div>${error ? `<button class="button" data-order-retry>${esc(t('orderRetry'))}</button><button class="button" data-order-reload>${esc(t('orderReload'))}</button>` : ''}`;
    panel.querySelector('ol').scrollTop = scroll;
    if (focus?.list) panel.querySelector('[data-order-list]')?.focus({ preventScroll: true });
    else if (focus?.id) {
      const row = [...panel.querySelectorAll('[data-order-id]')].find(
        (node) => node.dataset.orderId === focus.id,
      );
      (focus.move
        ? row?.querySelector(`[data-order-move="${focus.move}"]`)
        : row?.querySelector('.order-handle')
      )?.focus({ preventScroll: true });
    }
  }
  async function save() {
    if (saving || !dirty) return;
    saving = true;
    error = '';
    render();
    const id = selected;
    try {
      while (dirty) {
        dirty = false;
        const current = snapshot.orders[id];
        const items = [...current.items];
        const result = await api('/api/preferences/lists/' + id, {
          method: 'PUT',
          body: JSON.stringify({ items, version: current.version }),
        });
        current.version = result.version;
      }
    } catch (failure) {
      error = failure.message;
      dirty = true;
    } finally {
      saving = false;
      apply();
      render();
      onChange();
    }
  }
  function move(from, to) {
    const items = snapshot.orders[selected].items;
    if (from < 0 || to < 0 || to >= items.length || from === to) return;
    const positions = new Map(
      [...panel.querySelectorAll('[data-order-id]')].map((node) => [
        node.dataset.orderId,
        node.getBoundingClientRect().top,
      ]),
    );
    items.splice(to, 0, items.splice(from, 1)[0]);
    dirty = true;
    apply();
    render();
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      for (const node of panel.querySelectorAll('[data-order-id]')) {
        const delta = positions.get(node.dataset.orderId) - node.getBoundingClientRect().top;
        if (delta)
          node.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], {
            duration: 180,
            easing: 'ease-out',
          });
      }
    void save();
  }
  panel.addEventListener('change', (event) => {
    if (event.target.matches('[data-order-list]')) {
      if (dirty || saving) {
        event.target.value = selected;
        return;
      }
      selected = event.target.value;
      render();
    }
  });
  panel.addEventListener('click', (event) => {
    if (event.target.closest('[data-order-close]')) panel.hidePopover();
    if (event.target.closest('[data-order-retry]')) void save();
    if (event.target.closest('[data-order-reload]'))
      void load()
        .then(onChange)
        .catch((failure) => {
          error = failure.message;
          render();
        });
    const button = event.target.closest('[data-order-move]');
    if (button) {
      const from = snapshot.orders[selected].items.indexOf(
        button.closest('[data-order-id]').dataset.orderId,
      );
      move(from, from + Number(button.dataset.orderMove));
    }
  });
  panel.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.order-handle');
    if (!handle || event.button !== 0 || drag) return;
    event.preventDefault();
    const node = handle.closest('[data-order-id]');
    drag = {
      id: node.dataset.orderId,
      target: node.dataset.orderId,
      pointer: event.pointerId,
      startY: event.clientY,
    };
    node.classList.add('is-dragging');
    panel.setPointerCapture(event.pointerId);
  });
  panel.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const source = [...panel.querySelectorAll('[data-order-id]')].find(
      (node) => node.dataset.orderId === drag.id,
    );
    if (source) {
      source.style.transform = `translateY(${event.clientY - drag.startY}px)`;
      source.style.pointerEvents = 'none';
      source.style.position = 'relative';
      source.style.zIndex = '1';
    }
    const row = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-order-id]');
    panel.querySelector('.order-drop')?.classList.remove('order-drop');
    if (row && panel.contains(row)) {
      drag.target = row.dataset.orderId;
      row.classList.add('order-drop');
    }
    const list = panel.querySelector('ol'),
      bounds = list.getBoundingClientRect();
    if (event.clientY > bounds.bottom - 28) list.scrollTop += 12;
    if (event.clientY < bounds.top + 28) list.scrollTop -= 12;
  });
  const finish = (event) => {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointer)) return;
    const { id, target, pointer } = drag;
    drag = null;
    if (panel.hasPointerCapture(pointer)) panel.releasePointerCapture(pointer);
    const items = snapshot.orders[selected].items;
    if (event.type === 'pointerup') move(items.indexOf(id), items.indexOf(target));
    render();
  };
  panel.addEventListener('pointerup', finish);
  panel.addEventListener('pointercancel', finish);
  panel.addEventListener('lostpointercapture', finish);
  panel.addEventListener('toggle', (event) => {
    if (event.newState === 'closed' && drag) finish({ type: 'pointercancel' });
    if (event.newState === 'open') render();
  });
  return {
    load,
    render,
    get busy() {
      return saving || dirty || !!drag;
    },
  };
}
