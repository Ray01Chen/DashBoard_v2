/** Restore the original 45px / 200ms edit reveal independently of the form.
 * Capture only a clearly horizontal drag: native vertical scrolling, chart
 * controls and the station table must retain their usual pointer behavior. */
export function createOverviewSwipe(root) {
  let gesture = null,
    suppressedUntil = 0,
    suppressedCard = null;
  const cardFor = (node) => node.closest?.('.line-card');
  const available = () => root.dataset.editAvailable === 'true';
  function reveal(card, value) {
    if (!card || !available()) return;
    if (value)
      root.querySelectorAll('[data-edit-revealed]').forEach((other) => {
        if (other !== card && !other.hasAttribute('data-editor-open'))
          other.removeAttribute('data-edit-revealed');
      });
    card.toggleAttribute('data-edit-revealed', value);
  }
  function finish(cancelled = false) {
    if (!gesture) return;
    const { card, pointerId, dragging, start, distance } = gesture;
    gesture = null;
    card.removeAttribute('data-edit-dragging');
    card.style.removeProperty('--edit-drag');
    if (card.hasPointerCapture(pointerId)) card.releasePointerCapture(pointerId);
    if (dragging) {
      reveal(card, cancelled ? start > 0 : distance >= 23);
      suppressedUntil = performance.now() + 400;
      suppressedCard = card;
    }
  }
  root.addEventListener('pointerover', (event) => {
    const card = cardFor(event.target);
    if (
      available() &&
      event.pointerType === 'mouse' &&
      card &&
      !card.contains(event.relatedTarget) &&
      !card.hasAttribute('data-edit-dismissed')
    )
      reveal(card, true);
  });
  root.addEventListener('pointerout', (event) => {
    const card = cardFor(event.target);
    if (
      event.pointerType !== 'mouse' ||
      !card ||
      card.contains(event.relatedTarget) ||
      gesture?.card === card
    )
      return;
    card.removeAttribute('data-edit-dismissed');
    if (!card.hasAttribute('data-editor-open') && !card.contains(document.activeElement))
      reveal(card, false);
  });
  root.addEventListener('focusin', (event) => {
    if (event.target.closest('.line-edit-rail')) reveal(cardFor(event.target), true);
  });
  root.addEventListener('focusout', (event) => {
    const card = cardFor(event.target);
    if (
      card &&
      !card.contains(event.relatedTarget) &&
      !card.matches(':hover') &&
      !card.hasAttribute('data-editor-open')
    )
      reveal(card, false);
  });
  root.addEventListener('pointerdown', (event) => {
    if (
      !available() ||
      !event.isPrimary ||
      event.button !== 0 ||
      event.target.closest(
        'button:not(.line-identity-open), a, input, select, textarea, .row-expansion',
      )
    )
      return;
    const card = cardFor(event.target);
    if (!card || card.hasAttribute('data-editor-open')) return;
    const start = card.hasAttribute('data-edit-revealed') ? 45 : 0;
    gesture = {
      card,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start,
      distance: start,
      dragging: false,
    };
  });
  root.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const dx = event.clientX - gesture.x,
      dy = Math.abs(event.clientY - gesture.y);
    if (!gesture.dragging) {
      if (dy > 8 && dy >= Math.abs(dx)) {
        finish(true);
        return;
      }
      if (Math.abs(dx) < 12 || Math.abs(dx) <= dy * 1.3) return;
      gesture.dragging = true;
      gesture.card.setPointerCapture(event.pointerId);
      gesture.card.setAttribute('data-edit-dragging', '');
    }
    // touch-action resolves touch scrolling; cancel the mouse default to avoid
    // selecting text while dragging the card.
    if (event.pointerType === 'mouse') event.preventDefault();
    gesture.distance = Math.max(0, Math.min(45, gesture.start + dx));
    gesture.card.style.setProperty('--edit-drag', gesture.distance + 'px');
  });
  root.addEventListener('pointerup', (event) => {
    if (event.pointerId === gesture?.pointerId) finish();
  });
  for (const type of ['pointercancel', 'lostpointercapture'])
    root.addEventListener(type, (event) => {
      // Touch begins with implicit capture on a child. Transferring it to the
      // card emits lostpointercapture for that child, not a cancelled drag.
      if (
        event.pointerId === gesture?.pointerId &&
        (type !== 'lostpointercapture' || event.target === gesture.card)
      )
        finish(true);
    });
  root.addEventListener(
    'click',
    (event) => {
      // Swiping the read-only card must not also open its production detail page.
      if (
        performance.now() < suppressedUntil &&
        cardFor(event.target) === suppressedCard &&
        !event.target.closest(
          'button:not(.line-identity-open), a, input, select, textarea, .row-expansion',
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );
  return {
    sync(enabled) {
      root.dataset.editAvailable = String(enabled);
      if (suppressedCard && !root.contains(suppressedCard)) suppressedCard = null;
      if (!enabled) {
        finish(true);
        root
          .querySelectorAll('[data-edit-revealed]')
          .forEach((card) => card.removeAttribute('data-edit-revealed'));
      }
    },
    reset() {
      finish(true);
      root.querySelectorAll('[data-edit-revealed]').forEach((card) => {
        card.removeAttribute('data-edit-revealed');
        // A Save/Cancel click should settle the card even under the pointer.
        card.setAttribute('data-edit-dismissed', '');
      });
    },
  };
}
