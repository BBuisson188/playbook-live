(() => {
  'use strict';

  document.addEventListener('DOMContentLoaded', () => {
    const tip = document.createElement('div');
    tip.id = 'controlTooltip';
    tip.className = 'control-tooltip hidden';
    tip.setAttribute('role', 'tooltip');
    document.body.appendChild(tip);
    let hold = null;
    let hoverTimer = null;
    let dismissTimer = null;
    let suppressed = null;
    let described = null;

    function targetFor(node) {
      const element = node instanceof Element ? node : node?.parentElement;
      return element?.closest('.tooltip-target') || element?.closest('[data-tooltip], button[title], .tool-button');
    }

    function hide() {
      clearTimeout(hoverTimer);
      clearTimeout(dismissTimer);
      tip.classList.add('hidden');
      if (described) {
        const ids = (described.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== tip.id);
        if (ids.length) described.setAttribute('aria-describedby', ids.join(' '));
        else described.removeAttribute('aria-describedby');
      }
      described = null;
    }

    function show(target) {
      hide();
      tip.textContent = target.dataset.tooltip || target.title || target.getAttribute('aria-label') || target.textContent.trim();
      tip.classList.remove('hidden');
      const rect = target.getBoundingClientRect();
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
      tip.style.top = `${Math.max(8, rect.bottom + height + 8 <= innerHeight ? rect.bottom + 8 : rect.top - height - 8)}px`;
      described = target.matches('button') ? target : target.querySelector('button, input') || target;
      const ids = new Set((described.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      ids.add(tip.id);
      described.setAttribute('aria-describedby', [...ids].join(' '));
    }

    function cancelHold() {
      if (hold) clearTimeout(hold.timer);
      hold = null;
    }

    document.addEventListener('pointerdown', (event) => {
      hide();
      cancelHold();
      suppressed = null;
      const target = targetFor(event.target);
      if (!target || event.button !== 0 || !event.isPrimary) return;
      hold = { target, x: event.clientX, y: event.clientY, shown: false, pointerId: event.pointerId };
      hold.timer = setTimeout(() => {
        if (!hold) return;
        hold.shown = true;
        show(target);
      }, 550);
    }, true);

    document.addEventListener('pointermove', (event) => {
      if (!hold || event.pointerId !== hold.pointerId) return;
      if (Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > 10) {
        cancelHold();
        hide();
      }
    }, true);

    document.addEventListener('pointerup', (event) => {
      if (!hold || event.pointerId !== hold.pointerId) return;
      if (hold.shown) {
        suppressed = { target: hold.target, until: performance.now() + 1000 };
        dismissTimer = setTimeout(hide, 1800);
      }
      cancelHold();
    }, true);

    document.addEventListener('click', (event) => {
      if (!suppressed || performance.now() > suppressed.until || !suppressed.target.contains(event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressed = null;
    }, true);

    document.addEventListener('pointercancel', () => { cancelHold(); hide(); }, true);
    document.addEventListener('pointerover', (event) => {
      if (event.pointerType !== 'mouse' || hold) return;
      const target = targetFor(event.target);
      if (!target || target.contains(event.relatedTarget)) return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => show(target), 350);
    });
    document.addEventListener('pointerout', (event) => {
      if (hold) return;
      const target = targetFor(event.target);
      if (target && !target.contains(event.relatedTarget)) hide();
    });
    document.addEventListener('focusin', (event) => {
      const target = targetFor(event.target);
      if (target && event.target.matches(':focus-visible')) show(target);
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hide(); });
    document.addEventListener('scroll', () => { cancelHold(); hide(); }, true);
    window.addEventListener('resize', () => { cancelHold(); hide(); });
  });
})();
