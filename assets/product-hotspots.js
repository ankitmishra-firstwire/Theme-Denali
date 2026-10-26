(() => {
  const initProductHotspots = () => {
    document.querySelectorAll('[data-product-hotspots]').forEach((section) => {
      if (section.dataset.hotspotsInitialized === 'true') return;

      section.dataset.hotspotsInitialized = 'true';

      const points = section.querySelectorAll('.product-hotspots__point');

      const closePoint = (point) => {
        const trigger = point.querySelector('[data-hotspot-trigger]');
        const card = point.querySelector('[data-hotspot-card]');

        if (!trigger || !card) return;

        trigger.setAttribute('aria-expanded', 'false');
        card.hidden = true;
      };

      const closeAllPoints = (exceptPoint = null) => {
        points.forEach((point) => {
          if (point !== exceptPoint) {
            closePoint(point);
          }
        });
      };

      points.forEach((point) => {
        const trigger = point.querySelector('[data-hotspot-trigger]');
        const card = point.querySelector('[data-hotspot-card]');
        const closeButton = point.querySelector('[data-hotspot-close]');

        if (!trigger || !card) return;

        trigger.addEventListener('click', () => {
          const isOpen = trigger.getAttribute('aria-expanded') === 'true';

          closeAllPoints(point);

          if (isOpen) {
            closePoint(point);
            return;
          }

          const position = Number.parseFloat(
            point.style.getPropertyValue('--hotspot-x')
          );

          point.classList.toggle(
            'product-hotspots__point--left',
            position > 50
          );

          card.hidden = false;
          trigger.setAttribute('aria-expanded', 'true');
        });

        closeButton?.addEventListener('click', () => {
          closePoint(point);
          trigger.focus();
        });
      });

      document.addEventListener('click', (event) => {
        if (!section.contains(event.target)) {
          closeAllPoints();
          return;
        }

        const clickedTrigger = event.target.closest(
          '[data-hotspot-trigger]'
        );

        const clickedCard = event.target.closest('[data-hotspot-card]');

        if (!clickedTrigger && !clickedCard) {
          closeAllPoints();
        }
      });

      section.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          const openPoint = Array.from(points).find((point) => {
            const trigger = point.querySelector('[data-hotspot-trigger]');
            return trigger?.getAttribute('aria-expanded') === 'true';
          });

          if (openPoint) {
            closePoint(openPoint);
            openPoint.querySelector('[data-hotspot-trigger]')?.focus();
          }
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initProductHotspots);
  } else {
    initProductHotspots();
  }

  document.addEventListener('shopify:section:load', initProductHotspots);
})();