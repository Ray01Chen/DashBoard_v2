/** Top-layer popovers keep navigation outside the sidebar's scroll clipping.
 * A short leave delay bridges the pointer gap; keyboard and touch use the
 * same links and permission filtering as the existing page router. */
export function createNavigationFlyouts() {
  const groups = [...document.querySelectorAll('[data-nav-group]')];
  let opened = null,
    timer,
    suppressFocus = false,
    view;
  const close = () => {
    clearTimeout(timer);
    if (opened) {
      opened.menu.hidePopover();
      opened.button.setAttribute('aria-expanded', 'false');
      opened = null;
    }
  };
  function position() {
    if (!opened) return;
    const edge = document.querySelector('#sidebar').getBoundingClientRect(),
      box = opened.button.getBoundingClientRect();
    opened.menu.style.left =
      Math.max(8, Math.min(edge.right + 8, innerWidth - opened.menu.offsetWidth - 8)) + 'px';
    opened.menu.style.top =
      Math.max(8, Math.min(box.top, innerHeight - opened.menu.offsetHeight - 8)) + 'px';
  }
  function open(group) {
    clearTimeout(timer);
    const button = group.querySelector('[data-nav-trigger]'),
      menu = group.querySelector('[data-nav-popover]');
    if (group.hidden) return;
    if (opened?.menu !== menu) {
      close();
      opened = { button, menu };
      menu.showPopover();
    }
    button.setAttribute('aria-expanded', 'true');
    position();
  }
  function leave() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (
        opened &&
        !opened.button.matches(':hover') &&
        !opened.menu.matches(':hover') &&
        !opened.button.matches(':focus-visible') &&
        !opened.menu.contains(document.activeElement)
      )
        close();
    }, 160);
  }
  for (const group of groups) {
    const button = group.querySelector('[data-nav-trigger]'),
      menu = group.querySelector('[data-nav-popover]');
    button.addEventListener('pointerenter', () => {
      if (matchMedia('(hover: hover)').matches) open(group);
    });
    button.addEventListener('pointerleave', leave);
    menu.addEventListener('pointerenter', () => clearTimeout(timer));
    menu.addEventListener('pointerleave', leave);
    button.addEventListener('focus', () => {
      if (!suppressFocus && button.matches(':focus-visible')) open(group);
    });
    button.addEventListener('click', () => open(group));
    button.addEventListener('keydown', (event) => {
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        open(group);
        [...menu.querySelectorAll('a')].find((link) => !link.hidden)?.focus();
      }
    });
    menu.addEventListener('keydown', (event) => {
      const links = [...menu.querySelectorAll('a')].filter((link) => !link.hidden),
        index = links.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        links[
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? links.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
        ]?.focus();
      }
      if (['Escape', 'ArrowLeft'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        close();
        suppressFocus = true;
        button.focus();
        queueMicrotask(() => {
          suppressFocus = false;
        });
      }
    });
    group.addEventListener('focusout', () =>
      queueMicrotask(() => {
        if (!group.contains(document.activeElement)) leave();
      }),
    );
    menu.addEventListener('toggle', (event) => {
      if (event.newState === 'closed' && opened?.menu === menu) {
        opened = null;
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }
  window.addEventListener('resize', close);
  document.querySelector('#sidebar').addEventListener('scroll', position);
  return {
    close,
    setActive(next) {
      if (next !== view) close();
      view = next;
      groups.forEach((group) =>
        group.classList.toggle('active', !!group.querySelector(`[data-view="${view}"]`)),
      );
    },
    accessChanged() {
      groups.forEach((group) => {
        group.hidden = [...group.querySelectorAll('[data-view]')].every((link) => link.hidden);
      });
      if (opened?.button.closest('[data-nav-group]').hidden) close();
    },
  };
}
