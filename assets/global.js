/**
 * Denali global scripts.
 * Loaded on every page with `defer`. Each feature is a small custom element
 * or delegated listener so it keeps working after theme editor reloads.
 */

(() => {
  const routes = () => (window.theme && window.theme.routes) || { root: '/', cart: '/cart' };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  const debounce = (fn, wait = 300) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(null, args), wait);
    };
  };

  const announce = (message) => {
    const status = document.querySelector('[data-global-status]');
    if (!status) return;
    status.textContent = '';
    window.setTimeout(() => {
      status.textContent = message;
    }, 50);
  };

  window.DenaliTheme = Object.assign(window.DenaliTheme || {}, { debounce, announce });

  /* ------------------------------------------------------------------ */
  /* Cart count                                                          */
  /* ------------------------------------------------------------------ */

  const updateCartCount = (count) => {
    document.querySelectorAll('[data-cart-count]').forEach((bubble) => {
      const visible = bubble.querySelector('[aria-hidden="true"]');
      const hidden = bubble.querySelector('.visually-hidden');
      if (visible) visible.textContent = count;
      if (hidden && hidden.textContent) hidden.textContent = hidden.textContent.replace(/\d+/, count);
      bubble.classList.toggle('is-empty', Number(count) === 0);
    });
  };

  document.addEventListener('cart:updated', (event) => {
    if (event.detail && typeof event.detail.item_count === 'number') {
      updateCartCount(event.detail.item_count);
      return;
    }
    fetch(`${routes().cart}.js`, { headers: { Accept: 'application/json' } })
      .then((response) => response.json())
      .then((cart) => updateCartCount(cart.item_count))
      .catch(() => {});
  });

  /* ------------------------------------------------------------------ */
  /* Disclosure menus (header dropdowns, mobile menu, search modal)      */
  /* ------------------------------------------------------------------ */

  const closeDetails = (details, focusSummary = false) => {
    if (!details || !details.open) return;
    details.open = false;
    if (focusSummary) details.querySelector('summary')?.focus();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = event.target.closest('details[open]') ||
      document.querySelector('[data-search-modal][open], [data-mobile-menu][open], [data-dropdown][open]');
    if (open) closeDetails(open, true);
  });

  document.addEventListener('click', (event) => {
    document.querySelectorAll('[data-dropdown][open], [data-search-modal][open], [data-facets-drawer][open]').forEach((details) => {
      if (!details.contains(event.target)) closeDetails(details);
    });
  });

  document.addEventListener('toggle', (event) => {
    const details = event.target;
    if (!(details instanceof HTMLDetailsElement)) return;

    if (details.matches('[data-dropdown]') && details.open) {
      document.querySelectorAll('[data-dropdown][open]').forEach((other) => {
        if (other !== details) other.open = false;
      });
    }

    if (details.matches('[data-search-modal]') && details.open) {
      window.setTimeout(() => details.querySelector('input[type="search"]')?.focus(), 50);
    }

    if (details.matches('[data-mobile-menu]')) {
      document.documentElement.classList.toggle('scroll-lock', details.open);
    }
  }, true);

  document.addEventListener('focusout', (event) => {
    const dropdown = event.target.closest('[data-dropdown][open]');
    if (dropdown && event.relatedTarget && !dropdown.contains(event.relatedTarget)) {
      dropdown.open = false;
    }
  });

  /* ------------------------------------------------------------------ */
  /* Auto-submitting selects (sort, localization)                        */
  /* ------------------------------------------------------------------ */

  document.addEventListener('change', (event) => {
    const field = event.target;

    if (field.matches('[data-auto-submit]')) {
      field.form?.requestSubmit ? field.form.requestSubmit() : field.form?.submit();
      return;
    }

    const facetsForm = field.closest('[data-facets-form]');
    if (facetsForm && field.type === 'checkbox') {
      facetsForm.requestSubmit ? facetsForm.requestSubmit() : facetsForm.submit();
    }
  });

  /* Remove empty price fields so URLs stay clean */
  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!form.matches('[data-facets-form]')) return;
    form.querySelectorAll('input[type="number"]').forEach((input) => {
      if (input.value === '') input.disabled = true;
    });
  });

  /* ------------------------------------------------------------------ */
  /* Copy link                                                           */
  /* ------------------------------------------------------------------ */

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-copy-link]');
    if (!button || !navigator.clipboard) return;
    navigator.clipboard.writeText(button.dataset.copyLink).then(() => {
      announce(window.theme?.strings?.copied || 'Link copied');
    });
  });

  /* ------------------------------------------------------------------ */
  /* <quantity-input>                                                    */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('quantity-input')) {
    customElements.define('quantity-input', class QuantityInput extends HTMLElement {
      connectedCallback() {
        this.input = this.querySelector('input');
        this.addEventListener('click', this.onClick.bind(this));
      }

      onClick(event) {
        const button = event.target.closest('button');
        if (!button || !this.input) return;
        const step = Number(this.input.step) || 1;
        const min = Number(this.input.min) || 0;
        const max = this.input.max ? Number(this.input.max) : Infinity;
        const current = Number(this.input.value) || 0;
        const next = button.hasAttribute('data-quantity-plus') ? current + step : current - step;
        const clamped = Math.min(max, Math.max(min, next));
        if (clamped === current) return;
        this.input.value = clamped;
        this.input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <predictive-search>                                                 */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('predictive-search')) {
    customElements.define('predictive-search', class PredictiveSearch extends HTMLElement {
      connectedCallback() {
        this.input = this.querySelector('input[type="search"]');
        this.results = this.querySelector('[data-predictive-results]');
        this.status = this.querySelector('[data-predictive-status]');
        this.controller = null;
        if (!this.input || !this.results) return;

        this.input.addEventListener('input', debounce(() => this.onInput(), 250));
        this.input.addEventListener('focus', () => {
          if (this.input.value.trim() && this.results.innerHTML) this.open();
        });
        this.addEventListener('keydown', this.onKeydown.bind(this));
        document.addEventListener('click', (event) => {
          if (!this.contains(event.target)) this.close();
        });
      }

      onInput() {
        const term = this.input.value.trim();
        if (!term) {
          this.close();
          this.results.innerHTML = '';
          return;
        }
        this.fetchResults(term);
      }

      fetchResults(term) {
        if (this.controller) this.controller.abort();
        this.controller = new AbortController();
        const params = new URLSearchParams({
          q: term,
          section_id: 'predictive-search',
          'resources[type]': 'product,collection,page,article,query',
          'resources[limit]': '4',
          'resources[options][unavailable_products]': 'last'
        });
        const url = `${routes().predictiveSearch || '/search/suggest'}?${params.toString()}`;

        fetch(url, { signal: this.controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(response.status);
            return response.text();
          })
          .then((text) => {
            const html = new DOMParser().parseFromString(text, 'text/html');
            const inner = html.querySelector('.predictive-search__inner');
            if (!inner) {
              this.close();
              return;
            }
            this.results.innerHTML = inner.outerHTML;
            const count = inner.dataset.predictiveCount || '0';
            if (this.status) this.status.textContent = `${count}`;
            this.open();
          })
          .catch((error) => {
            if (error.name !== 'AbortError') this.close();
          });
      }

      getOptions() {
        return Array.from(this.results.querySelectorAll('[role="option"] a, .predictive-search__all'));
      }

      onKeydown(event) {
        if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
        const options = this.getOptions();
        if (event.key === 'Escape') {
          if (!this.results.hidden) {
            event.stopPropagation();
            this.close();
            this.input.focus();
          }
          return;
        }
        if (!options.length || this.results.hidden) return;
        event.preventDefault();
        const index = options.indexOf(document.activeElement);
        let next = event.key === 'ArrowDown' ? index + 1 : index - 1;
        if (next < -1) next = options.length - 1;
        if (next >= options.length) next = -1;
        if (next === -1) {
          this.input.focus();
        } else {
          options[next].focus();
        }
      }

      open() {
        this.results.hidden = false;
        this.input.setAttribute('aria-expanded', 'true');
      }

      close() {
        if (!this.results) return;
        this.results.hidden = true;
        this.input?.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <product-recommendations>                                           */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('product-recommendations')) {
    customElements.define('product-recommendations', class ProductRecommendations extends HTMLElement {
      connectedCallback() {
        if (this.dataset.loaded === 'true' || !this.dataset.url) return;
        const load = () => {
          this.dataset.loaded = 'true';
          fetch(this.dataset.url)
            .then((response) => response.text())
            .then((text) => {
              const html = new DOMParser().parseFromString(text, 'text/html');
              const fresh = html.getElementById(this.dataset.targetId);
              if (fresh && fresh.innerHTML.trim().length) {
                this.innerHTML = fresh.innerHTML;
              } else {
                this.hidden = true;
              }
            })
            .catch(() => {
              this.hidden = true;
            });
        };

        if ('IntersectionObserver' in window) {
          const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer.disconnect();
              load();
            }
          }, { rootMargin: '0px 0px 400px 0px' });
          observer.observe(this);
        } else {
          load();
        }
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <deferred-media> (product videos and 3D models)                     */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('deferred-media')) {
    customElements.define('deferred-media', class DeferredMedia extends HTMLElement {
      connectedCallback() {
        this.querySelector('.deferred-media__poster')?.addEventListener('click', () => this.loadContent());
      }

      loadContent(focus = true) {
        if (this.getAttribute('loaded')) return;
        const template = this.querySelector('template');
        if (!template) return;
        const content = template.content.firstElementChild?.cloneNode(true);
        if (!content) return;

        document.querySelectorAll('deferred-media[loaded] video').forEach((video) => video.pause());

        this.setAttribute('loaded', 'true');
        this.appendChild(content);
        this.querySelector('.deferred-media__poster')?.setAttribute('hidden', '');

        if (content.tagName === 'VIDEO') {
          content.play().catch(() => {});
        }

        if (this.dataset.mediaType === 'model' && window.Shopify && window.Shopify.loadFeatures) {
          window.Shopify.loadFeatures([
            {
              name: 'model-viewer-ui',
              version: '1.0',
              onLoad: (errors) => {
                if (errors) return;
                const viewer = this.querySelector('model-viewer');
                if (viewer && window.Shopify.ModelViewerUI) {
                  this.modelViewerUI = new window.Shopify.ModelViewerUI(viewer);
                }
              }
            }
          ]);
        }

        if (focus) content.focus?.();
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <media-gallery> (product images)                                    */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('media-gallery')) {
    customElements.define('media-gallery', class MediaGallery extends HTMLElement {
      connectedCallback() {
        this.list = this.querySelector('[data-media-list]');
        this.thumbnails = Array.from(this.querySelectorAll('[data-thumbnail-for]'));
        this.thumbnails.forEach((thumb) => {
          thumb.addEventListener('click', () => this.setActiveMedia(thumb.dataset.thumbnailFor, true));
        });

        if (this.list && 'IntersectionObserver' in window) {
          this.observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
                this.markThumbnail(entry.target.dataset.mediaId);
              }
            });
          }, { root: this.list, threshold: [0.6] });
          this.list.querySelectorAll('[data-media-id]').forEach((item) => this.observer.observe(item));
        }
      }

      disconnectedCallback() {
        this.observer?.disconnect();
      }

      setActiveMedia(mediaId, userInitiated = false) {
        const item = this.querySelector(`[data-media-id="${mediaId}"]`);
        if (!item || !this.list) return;
        this.list.scrollTo({ left: item.offsetLeft - this.list.offsetLeft, behavior: userInitiated ? 'smooth' : 'auto' });
        this.markThumbnail(mediaId);
        this.querySelectorAll('deferred-media[loaded] video').forEach((video) => video.pause());
      }

      markThumbnail(mediaId) {
        this.thumbnails.forEach((thumb) => {
          const active = thumb.dataset.thumbnailFor === String(mediaId);
          thumb.classList.toggle('is-active', active);
          if (active) {
            thumb.setAttribute('aria-current', 'true');
          } else {
            thumb.removeAttribute('aria-current');
          }
        });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Theme editor support                                                */
  /* ------------------------------------------------------------------ */

  document.addEventListener('shopify:block:select', (event) => {
    const details = event.target.closest('details');
    if (details) details.open = true;
  });
})();
