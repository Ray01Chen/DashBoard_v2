/** Page motion is a presentation concern, independent of alert lamps/reasons.
 * Outgoing rows keep their own layout while the incoming rows adopt their final
 * heights. Compositing the two stacks avoids scaling text or interpolating
 * incompatible min-heights when seven compact rows become one tall row. */
const motions = new WeakMap();
const active = new Set();
const preference = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
export const pageMotionDuration = 600;

export function isMonitorPageTurn(previous, next) {
  return (
    !!previous &&
    previous.revision !== next.revision &&
    previous.page !== next.page &&
    previous.signature === next.signature &&
    previous.size === next.size &&
    previous.board === next.board &&
    previous.metric === next.metric &&
    previous.language === next.language
  );
}
export function cancelMonitorPageMotion(cards) {
  const motion = motions.get(cards);
  if (!motion) return;
  motions.delete(cards);
  active.delete(cards);
  motion.animations.forEach((animation) => animation.cancel());
  motion.snapshot.remove();
  motion.viewport.classList.remove('is-page-moving');
  delete motion.viewport.dataset.pageDirection;
}
preference?.addEventListener?.('change', () => {
  if (preference.matches) [...active].forEach(cancelMonitorPageMotion);
});

export function replaceMonitorPage(cards, markup, { animate = false, direction = 1 } = {}) {
  cancelMonitorPageMotion(cards);
  const viewport = cards.parentElement;
  const enabled =
    animate &&
    !preference?.matches &&
    typeof cards.animate === 'function' &&
    cards.children.length > 0;
  const ordinary = !document.body.classList.contains('fullscreen-board');
  const previousHeight = enabled && ordinary ? viewport.getBoundingClientRect().height : 0;
  const snapshot = enabled ? cards.cloneNode(true) : null;
  cards.innerHTML = markup;
  if (!snapshot) return;
  snapshot.removeAttribute('id');
  snapshot.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
  snapshot.classList.add('carousel-snapshot');
  snapshot.setAttribute('aria-hidden', 'true');
  snapshot.inert = true;
  viewport.append(snapshot);
  viewport.classList.add('is-page-moving');
  viewport.dataset.pageDirection = direction > 0 ? 'next' : 'previous';
  const options = {
    duration: pageMotionDuration,
    easing: 'cubic-bezier(.22,.61,.36,1)',
    fill: 'both',
  };
  const animations = [
    snapshot.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${-direction * 100}%)`, opacity: 0 },
      ],
      options,
    ),
    cards.animate(
      [
        { transform: `translateX(${direction * 100}%)`, opacity: 0 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      options,
    ),
  ];
  // Ordinary mode may change document height; fullscreen keeps a fixed viewport
  // and only the composed row layouts differ, so it needs no per-frame reflow.
  const nextHeight = ordinary ? viewport.getBoundingClientRect().height : 0;
  if (ordinary && previousHeight !== nextHeight)
    animations.push(
      viewport.animate(
        [{ height: previousHeight + 'px' }, { height: nextHeight + 'px' }],
        options,
      ),
    );
  const motion = { snapshot, viewport, animations };
  motions.set(cards, motion);
  active.add(cards);
  Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
    if (motions.get(cards) === motion) cancelMonitorPageMotion(cards);
  });
}
