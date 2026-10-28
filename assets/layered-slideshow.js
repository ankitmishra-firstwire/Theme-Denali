(() => {
  function initLayeredSlideshow(section) {
    if (section.dataset.initialized === 'true') return;

    const slides = Array.from(section.querySelectorAll('[data-slide]'));
    const dots = Array.from(section.querySelectorAll('[data-slide-to]'));
    const prevButton = section.querySelector('[data-prev]');
    const nextButton = section.querySelector('[data-next]');
    const pauseButton = section.querySelector('[data-pause]');
    let userPaused = false;

    if (slides.length < 2) return;

    section.dataset.initialized = 'true';

    let currentIndex = Math.max(
      0,
      slides.findIndex((slide) => slide.classList.contains('is-active'))
    );

    let timer = null;

    const autoplay = section.dataset.autoplay === 'true';
    const interval = Math.max(
      3000,
      Number(section.dataset.interval) || 5000
    );

    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    function showSlide(index) {
      currentIndex = (index + slides.length) % slides.length;

      slides.forEach((slide, i) => {
        const active = i === currentIndex;

        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });

      dots.forEach((dot, i) => {
        const active = i === currentIndex;

        dot.classList.toggle('is-active', active);
        dot.setAttribute('aria-current', String(active));
      });
    }

    function stopAutoplay() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    }

    function startAutoplay() {
      stopAutoplay();

      if (!autoplay || reducedMotion || userPaused) return;

      timer = window.setInterval(() => {
        showSlide(currentIndex + 1);
      }, interval);
    }

    function changeSlide(index) {
      showSlide(index);
      startAutoplay();
    }

    if (pauseButton && reducedMotion) {
      pauseButton.hidden = true;
    }

    pauseButton?.addEventListener('click', () => {
      userPaused = !userPaused;
      pauseButton.setAttribute('aria-pressed', String(userPaused));
      pauseButton.setAttribute(
        'aria-label',
        userPaused ? pauseButton.dataset.labelPlay : pauseButton.dataset.labelPause
      );
      const icon = pauseButton.querySelector('[data-pause-icon]');
      if (icon) icon.innerHTML = userPaused ? '&#9654;' : '&#10074;&#10074;';
      if (userPaused) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });

    prevButton?.addEventListener('click', () => {
      changeSlide(currentIndex - 1);
    });

    nextButton?.addEventListener('click', () => {
      changeSlide(currentIndex + 1);
    });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        changeSlide(Number(dot.dataset.slideTo));
      });
    });

    section.addEventListener('mouseenter', stopAutoplay);
    section.addEventListener('mouseleave', startAutoplay);

    section.addEventListener('focusin', stopAutoplay);
    section.addEventListener('focusout', (event) => {
      if (!section.contains(event.relatedTarget)) {
        startAutoplay();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopAutoplay();
      } else {
        startAutoplay();
      }
    });

    section.layeredShowSlide = (index, pause) => {
      showSlide(index);
      if (pause) {
        stopAutoplay();
      }
    };

    showSlide(currentIndex);
    startAutoplay();
  }

  function initAllSlideshows() {
    document
      .querySelectorAll('.layered-slideshow')
      .forEach(initLayeredSlideshow);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllSlideshows);
  } else {
    initAllSlideshows();
  }

  document.addEventListener('shopify:block:select', (event) => {
    const slide = event.target.closest('[data-slide]');
    const section = slide?.closest('.layered-slideshow');
    if (!section || !section.layeredShowSlide) return;
    const slides = Array.from(section.querySelectorAll('[data-slide]'));
    section.layeredShowSlide(slides.indexOf(slide), true);
  });

  document.addEventListener('shopify:section:load', (event) => {
    const section = event.target.matches('.layered-slideshow')
      ? event.target
      : event.target.querySelector('.layered-slideshow');

    if (section) {
      initLayeredSlideshow(section);
    }
  });
})();