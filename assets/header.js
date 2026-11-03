/* ==========================================================================
   Mega Header — vanilla JavaScript, no dependencies
   Defines <mega-header>. Because it is a custom element, the Shopify theme
   editor's section re-rendering (shopify:section:load / unload) is handled
   automatically through connectedCallback / disconnectedCallback.
   ========================================================================== */
(() => {
  'use strict';

  if (customElements.get('mega-header')) return;

  const DESKTOP = window.matchMedia('(min-width: 990px)');
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(',');

  const isVisible = (el) =>
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) &&
    getComputedStyle(el).visibility !== 'hidden';

  class MegaHeader extends HTMLElement {
    /* ------------------------------------------------------------------ */
    /* Lifecycle                                                           */
    /* ------------------------------------------------------------------ */
    connectedCallback() {
      this.section = this.closest('.shopify-section') || this;
      this.trigger = this.dataset.trigger === 'click' ? 'click' : 'hover';
      this.openDelay = parseInt(this.dataset.openDelay, 10) || 0;
      this.closeDelay = parseInt(this.dataset.closeDelay, 10) || 0;
      this.stickyMode = this.dataset.sticky || 'none';
      this.isTransparent = this.classList.contains('hdr--transparent');

      this.openItem = null;
      this.openTimer = null;
      this.closeTimer = null;
      this.editorLock = false;
      this.lastPointer = 'mouse';
      this.lastY = window.scrollY;
      this.searchOpen = false;
      this.drawerOpen = false;

      this.ac = new AbortController();
      const o = { signal: this.ac.signal };

      this.initMenu(o);
      this.initSubmenus(o);
      this.initSearch(o);
      this.initDrawer(o);
      this.initScroll(o);
      this.initAnnouncement(o);
      this.initCart(o);
      this.initEditor(o);
      this.initMeasure();
    }

    disconnectedCallback() {
      if (this.ac) this.ac.abort();
      if (this.ro) this.ro.disconnect();
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      this.stopAnnouncement();
      if (this.drawerOpen) this.unlockScroll();
    }

    /* ------------------------------------------------------------------ */
    /* Desktop menu                                                        */
    /* ------------------------------------------------------------------ */
    initMenu(o) {
      this.items = Array.from(this.querySelectorAll('.hdr__menu > [data-hdr-item][data-has-panel]'));
      this.topLinks = Array.from(this.querySelectorAll('.hdr__menu > .hdr__item > .hdr__link'));

      // Remember the last pointer type so touch taps behave differently from mouse clicks.
      document.addEventListener('pointerdown', (e) => { this.lastPointer = e.pointerType || 'mouse'; }, { ...o, capture: true });

      this.items.forEach((item) => {
        const toggles = item.querySelectorAll(':scope > [data-hdr-toggle]');
        const link = item.querySelector(':scope > a.hdr__link');

        if (this.trigger === 'hover') {
          item.addEventListener('pointerenter', (e) => {
            if (e.pointerType !== 'mouse' || !DESKTOP.matches) return;
            this.scheduleOpen(item);
          }, o);
          item.addEventListener('pointerleave', (e) => {
            if (e.pointerType !== 'mouse' || !DESKTOP.matches) return;
            this.scheduleClose(item);
          }, o);

          // Touch / pen: no hover, so the first tap opens and the second follows the link.
          if (link) {
            link.addEventListener('click', (e) => {
              if (this.lastPointer !== 'mouse' && !this.isOpen(item)) {
                e.preventDefault();
                this.open(item);
              }
            }, o);
          }
        }

        toggles.forEach((toggle) => {
          toggle.addEventListener('click', (e) => {
            e.preventDefault();
            // In hover mode a mouse click on the caret should never close a menu the hover just opened.
            const mouseClick = e.detail > 0 && this.lastPointer === 'mouse';
            if (this.trigger === 'hover' && mouseClick) {
              this.open(item);
              return;
            }
            if (this.isOpen(item)) this.close(item, { force: true });
            else this.open(item);
          }, o);
        });

        item.addEventListener('keydown', (e) => this.onItemKeydown(e, item), o);
      });

      // Left / right arrows move between top-level items.
      const menu = this.querySelector('.hdr__menu');
      if (menu) {
        menu.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          const top = e.target.closest('.hdr__menu > .hdr__item > .hdr__link, .hdr__menu > .hdr__item > .hdr__caret');
          if (!top) return;
          const current = top.closest('.hdr__item').querySelector(':scope > .hdr__link');
          const idx = this.topLinks.indexOf(current);
          if (idx === -1) return;
          const step = e.key === 'ArrowRight' ? 1 : -1;
          const next = this.topLinks[(idx + step + this.topLinks.length) % this.topLinks.length];
          e.preventDefault();
          if (this.openItem) this.close(this.openItem, { force: true });
          next.focus();
        }, o);
      }

      // Click outside closes.
      document.addEventListener('click', (e) => {
        if (this.openItem && !this.openItem.contains(e.target)) this.close(this.openItem);
        if (
          this.searchOpen &&
          !this.search.contains(e.target) &&
          !e.target.closest('[data-search-toggle]')
        ) {
          this.closeSearch(false);
        }
      }, o);

      // Escape closes menus and search.
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (this.openItem) {
          const item = this.openItem;
          const hadFocus = item.contains(document.activeElement);
          this.close(item, { force: true });
          if (hadFocus) this.getItemControl(item)?.focus();
        }
        if (this.searchOpen) this.closeSearch(true);
      }, o);

      // Tabbing out of an open menu closes it.
      this.addEventListener('focusout', (e) => {
        if (!this.openItem || !e.relatedTarget) return;
        if (this.openItem.contains(e.relatedTarget)) return;
        this.close(this.openItem);
      }, o);

      DESKTOP.addEventListener('change', () => {
        if (this.openItem) this.close(this.openItem, { force: true });
      }, o);
    }

    getItemControl(item) {
      return item.querySelector(':scope > [data-hdr-toggle]') || item.querySelector(':scope > .hdr__link');
    }

    onItemKeydown(e, item) {
      const panel = item.querySelector(':scope > [data-hdr-panel]');
      if (!panel) return;
      const inPanel = panel.contains(e.target);

      if (!inPanel && e.key === 'ArrowDown') {
        e.preventDefault();
        this.open(item);
        this.focusFirst(panel);
        return;
      }

      if (inPanel && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const focusables = this.focusables(panel);
        const i = focusables.indexOf(document.activeElement);
        if (i === -1) return;
        e.preventDefault();
        const n = e.key === 'ArrowDown' ? Math.min(i + 1, focusables.length - 1) : i - 1;
        if (n < 0) this.getItemControl(item)?.focus();
        else focusables[n].focus();
      }
    }

    focusables(root) {
      return Array.from(root.querySelectorAll(FOCUSABLE)).filter(isVisible);
    }

    focusFirst(panel) {
      requestAnimationFrame(() => {
        const first = this.focusables(panel)[0];
        if (first) first.focus();
      });
    }

    isOpen(item) {
      return item.classList.contains('is-open');
    }

    scheduleOpen(item) {
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      if (this.openItem === item) return;
      // Switching between items is instant; the first open respects the delay (hover intent).
      const delay = this.openItem ? 0 : this.openDelay;
      this.openTimer = setTimeout(() => this.open(item), delay);
    }

    scheduleClose(item) {
      clearTimeout(this.openTimer);
      clearTimeout(this.closeTimer);
      this.closeTimer = setTimeout(() => this.close(item), this.closeDelay);
    }

    open(item) {
      if (!item) return;
      clearTimeout(this.closeTimer);
      clearTimeout(this.openTimer);
      if (this.openItem && this.openItem !== item) this.close(this.openItem, { force: true });
      if (this.searchOpen) this.closeSearch(false);

      const panel = item.querySelector(':scope > [data-hdr-panel]');
      if (panel && panel.classList.contains('hdr-dd')) this.fitDropdown(panel);

      item.classList.add('is-open');
      item.querySelectorAll(':scope > [data-hdr-toggle]').forEach((t) => t.setAttribute('aria-expanded', 'true'));
      this.openItem = item;
      this.classList.add('has-open');
      this.section.classList.remove('is-hidden');
      this.updateSolid();
    }

    close(item, { force = false } = {}) {
      if (!item) return;
      if (this.editorLock && !force) return;
      item.classList.remove('is-open');
      item.querySelectorAll(':scope > [data-hdr-toggle]').forEach((t) => t.setAttribute('aria-expanded', 'false'));
      item.querySelectorAll('.is-touch-open').forEach((el) => el.classList.remove('is-touch-open'));
      if (this.openItem === item) {
        this.openItem = null;
        this.classList.remove('has-open');
      }
      this.updateSolid();
    }

    // Flip a dropdown to the left edge of its item when it would overflow the viewport.
    fitDropdown(panel) {
      panel.classList.remove('is-flipped');
      const rect = panel.getBoundingClientRect();
      if (rect.right > document.documentElement.clientWidth - 8) panel.classList.add('is-flipped');
    }

    /* ------------------------------------------------------------------ */
    /* Nested dropdowns (3rd level flyouts)                                */
    /* ------------------------------------------------------------------ */
    initSubmenus(o) {
      this.querySelectorAll('.hdr-dd__item--parent').forEach((li) => {
        const link = li.querySelector(':scope > .hdr-dd__link');
        const sub = li.querySelector(':scope > .hdr-dd__sub');
        if (!link || !sub) return;

        const show = () => {
          li.classList.remove('opens-left');
          const rect = sub.getBoundingClientRect();
          if (rect.right > document.documentElement.clientWidth - 8) li.classList.add('opens-left');
          link.setAttribute('aria-expanded', 'true');
        };
        const hide = () => {
          li.classList.remove('is-touch-open');
          link.setAttribute('aria-expanded', 'false');
        };

        li.addEventListener('pointerenter', show, o);
        li.addEventListener('focusin', show, o);
        li.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hide(); }, o);
        li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget)) hide(); }, o);

        // Touch: first tap reveals the flyout, second tap follows the link.
        link.addEventListener('click', (e) => {
          if (this.lastPointer === 'mouse' || li.classList.contains('is-touch-open')) return;
          e.preventDefault();
          li.parentElement.querySelectorAll(':scope > .is-touch-open').forEach((el) => el.classList.remove('is-touch-open'));
          li.classList.add('is-touch-open');
          show();
        }, o);

        li.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' && e.target === link) {
            e.preventDefault();
            e.stopPropagation();
            show();
            const first = sub.querySelector('a[href]');
            if (first) first.focus();
          } else if (e.key === 'ArrowLeft' && sub.contains(e.target)) {
            e.preventDefault();
            e.stopPropagation();
            link.focus();
          }
        }, o);
      });
    }

    /* ------------------------------------------------------------------ */
    /* Search panel                                                        */
    /* ------------------------------------------------------------------ */
    initSearch(o) {
      this.search = this.querySelector('[data-search-panel]');
      this.searchToggles = Array.from(this.querySelectorAll('[data-search-toggle]'));
      if (!this.search) return;

      this.searchToggles.forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          if (this.searchOpen) this.closeSearch(true);
          else this.openSearch();
        }, o);
      });

      const closeBtn = this.search.querySelector('[data-search-close]');
      if (closeBtn) closeBtn.addEventListener('click', () => this.closeSearch(true), o);
    }

    openSearch() {
      if (this.openItem) this.close(this.openItem, { force: true });
      this.searchOpen = true;
      this.search.classList.add('is-open');
      this.searchToggles.forEach((b) => b.setAttribute('aria-expanded', 'true'));
      this.section.classList.remove('is-hidden');
      this.updateSolid();
      setTimeout(() => {
        const input = this.search.querySelector('input[type="search"]');
        if (input) input.focus();
      }, 60);
    }

    closeSearch(restoreFocus) {
      if (!this.search || !this.searchOpen) return;
      this.searchOpen = false;
      this.search.classList.remove('is-open');
      this.searchToggles.forEach((b) => b.setAttribute('aria-expanded', 'false'));
      this.updateSolid();
      if (restoreFocus) {
        const visibleToggle = this.searchToggles.find(isVisible);
        if (visibleToggle) visibleToggle.focus();
      }
    }

    /* ------------------------------------------------------------------ */
    /* Mobile drawer                                                       */
    /* ------------------------------------------------------------------ */
    initDrawer(o) {
      this.drawer = this.querySelector('[data-drawer]');
      if (!this.drawer) return;
      this.drawerPanel = this.drawer.querySelector('[data-drawer-panel]');
      this.burger = this.querySelector('[data-drawer-open]');

      if (this.burger) this.burger.addEventListener('click', () => this.openDrawer(), o);
      this.drawer.querySelectorAll('[data-drawer-close]').forEach((el) => {
        el.addEventListener('click', () => this.closeDrawer(), o);
      });

      this.drawer.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.closeDrawer();
        } else if (e.key === 'Tab') {
          this.trapFocus(e);
        }
      }, o);

      this.drawer.querySelectorAll('[data-acc-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => this.toggleAccordion(btn), o);
      });

      DESKTOP.addEventListener('change', (e) => {
        if (e.matches && this.drawerOpen) this.closeDrawer(false);
      }, o);
    }

    toggleAccordion(btn, force) {
      const acc = btn.closest('.hdr-acc');
      if (!acc) return;
      const open = typeof force === 'boolean' ? force : !acc.classList.contains('is-open');

      if (open && this.drawer.dataset.single === 'true') {
        acc.parentElement.querySelectorAll(':scope > .hdr-acc.is-open').forEach((sib) => {
          if (sib === acc) return;
          sib.classList.remove('is-open');
          const sibBtn = sib.querySelector(':scope > .hdr-acc__row > [data-acc-toggle]');
          if (sibBtn) sibBtn.setAttribute('aria-expanded', 'false');
        });
      }

      acc.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
    }

    openDrawer() {
      if (!this.drawer || this.drawerOpen) return;
      this.drawerOpen = true;
      this.lastFocus = document.activeElement;
      if (this.openItem) this.close(this.openItem, { force: true });
      if (this.searchOpen) this.closeSearch(false);

      this.drawer.classList.add('is-open');
      if (this.burger) this.burger.setAttribute('aria-expanded', 'true');
      this.section.classList.remove('is-hidden');
      this.lockScroll();
      this.updateSolid();

      setTimeout(() => {
        const closeBtn = this.drawer.querySelector('.hdr-drawer__close');
        (closeBtn || this.drawerPanel).focus();
      }, 60);
    }

    closeDrawer(restoreFocus = true) {
      if (!this.drawer || !this.drawerOpen) return;
      this.drawerOpen = false;
      this.drawer.classList.remove('is-open');
      if (this.burger) this.burger.setAttribute('aria-expanded', 'false');
      this.unlockScroll();
      this.updateSolid();
      if (restoreFocus) {
        const target = this.lastFocus && isVisible(this.lastFocus) ? this.lastFocus : this.burger;
        if (target) target.focus();
      }
    }

    trapFocus(e) {
      const items = this.focusables(this.drawerPanel);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    lockScroll() {
      const root = document.documentElement;
      const scrollbar = window.innerWidth - root.clientWidth;
      root.style.setProperty('--hdr-sbw', `${scrollbar}px`);
      root.classList.add('hdr-lock');
    }

    unlockScroll() {
      const root = document.documentElement;
      root.classList.remove('hdr-lock');
      root.style.removeProperty('--hdr-sbw');
    }

    /* ------------------------------------------------------------------ */
    /* Sticky / transparent behaviour                                      */
    /* ------------------------------------------------------------------ */
    initScroll(o) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          this.handleScroll();
          ticking = false;
        });
      };
      window.addEventListener('scroll', onScroll, { ...o, passive: true });
      this.handleScroll();
    }

    handleScroll() {
      const y = Math.max(window.scrollY, 0);
      this.classList.toggle('is-scrolled', y > 4);

      if (this.stickyMode === 'scroll_up') {
        const threshold = this.section.offsetHeight + 40;
        const busy = this.openItem || this.drawerOpen || this.searchOpen;
        if (busy || y < threshold || y < this.lastY - 2) {
          this.section.classList.remove('is-hidden');
        } else if (y > this.lastY + 2) {
          this.section.classList.add('is-hidden');
        }
      }

      this.lastY = y;
      this.updateSolid();
    }

    updateSolid() {
      if (!this.isTransparent) return;
      const scrolled = this.stickyMode !== 'none' && this.classList.contains('is-scrolled');
      const solid = scrolled || !!this.openItem || this.searchOpen || this.drawerOpen;
      this.classList.toggle('is-solid', solid);
    }

    // Publishes the header height as --hdr-offset (used by fixed / transparent modes and panel max-height).
    initMeasure() {
      const set = () => {
        document.documentElement.style.setProperty('--hdr-offset', `${this.section.offsetHeight}px`);
      };
      set();
      if ('ResizeObserver' in window) {
        this.ro = new ResizeObserver(set);
        this.ro.observe(this.section);
      }
    }

    /* ------------------------------------------------------------------ */
    /* Announcement bar                                                    */
    /* ------------------------------------------------------------------ */
    initAnnouncement(o) {
      this.ann = this.querySelector('[data-ann]');
      this.slides = this.ann ? Array.from(this.ann.querySelectorAll('[data-ann-slide]')) : [];
      this.annIndex = 0;
      if (this.slides.length < 2) return;

      const prev = this.ann.querySelector('[data-ann-prev]');
      const next = this.ann.querySelector('[data-ann-next]');
      if (prev) prev.addEventListener('click', () => { this.showSlide(this.annIndex - 1); this.startAnnouncement(); }, o);
      if (next) next.addEventListener('click', () => { this.showSlide(this.annIndex + 1); this.startAnnouncement(); }, o);

      this.ann.addEventListener('pointerenter', () => { this.annPaused = true; }, o);
      this.ann.addEventListener('pointerleave', () => { this.annPaused = false; }, o);
      this.ann.addEventListener('focusin', () => { this.annPaused = true; }, o);
      this.ann.addEventListener('focusout', (e) => {
        if (!this.ann.contains(e.relatedTarget)) this.annPaused = false;
      }, o);

      this.startAnnouncement();
    }

    startAnnouncement() {
      this.stopAnnouncement();
      if (!this.ann || this.ann.dataset.autoplay !== 'true' || REDUCED.matches || this.slides.length < 2) return;
      const interval = parseInt(this.ann.dataset.interval, 10) || 5000;
      this.annTimer = setInterval(() => {
        if (!this.annPaused && !this.editorAnnLock && !document.hidden) this.showSlide(this.annIndex + 1);
      }, interval);
    }

    stopAnnouncement() {
      clearInterval(this.annTimer);
    }

    showSlide(index) {
      if (!this.slides.length) return;
      const n = this.slides.length;
      this.annIndex = ((index % n) + n) % n;
      this.slides.forEach((slide, i) => {
        const active = i === this.annIndex;
        slide.classList.toggle('is-active', active);
        slide.setAttribute('aria-hidden', String(!active));
      });
      const color = this.slides[this.annIndex].dataset.text;
      if (color) this.ann.style.setProperty('--ann-arrow', color);
    }

    /* ------------------------------------------------------------------ */
    /* Cart count                                                          */
    /* Other theme code can dispatch:                                      */
    /*   document.dispatchEvent(new CustomEvent('cart:updated',            */
    /*     { detail: { item_count: 3 } }))                                 */
    /* or 'cart:refresh' to make the header fetch /cart.js itself.         */
    /* ------------------------------------------------------------------ */
    initCart(o) {
      const apply = (count) => {
        this.querySelectorAll('[data-cart-count]').forEach((el) => {
          el.textContent = count;
          el.hidden = !count;
        });
        this.querySelectorAll('[data-cart-link]').forEach((el) => {
          el.setAttribute('aria-label', `Cart, ${count} ${count === 1 ? 'item' : 'items'}`);
        });
      };

      const refresh = () => {
        const root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
        fetch(`${root}cart.js`, { headers: { Accept: 'application/json' } })
          .then((r) => r.json())
          .then((cart) => apply(cart.item_count))
          .catch(() => {});
      };

      document.addEventListener('cart:updated', (e) => {
        const d = e.detail || {};
        const count = typeof d.item_count === 'number' ? d.item_count : d.cart && d.cart.item_count;
        if (typeof count === 'number') apply(count);
        else refresh();
      }, o);
      document.addEventListener('cart:refresh', refresh, o);
    }

    /* ------------------------------------------------------------------ */
    /* Theme editor integration                                            */
    /* ------------------------------------------------------------------ */
    initEditor(o) {
      if (!(window.Shopify && window.Shopify.designMode)) return;

      document.addEventListener('shopify:block:select', (e) => {
        if (!this.contains(e.target)) return;

        const panel = e.target.closest('[data-hdr-panel]');
        if (panel) {
          const item = panel.closest('[data-hdr-item]');
          if (DESKTOP.matches) {
            this.editorLock = false;
            this.open(item);
            this.editorLock = true; // keep it open while the merchant edits the block
          } else {
            this.openDrawer();
            const acc = this.drawer && this.drawer.querySelector(`[data-mm-ref="${panel.dataset.mmId}"]`);
            const btn = acc && acc.querySelector(':scope > .hdr-acc__row > [data-acc-toggle]');
            if (btn) this.toggleAccordion(btn, true);
          }
          return;
        }

        const slide = e.target.closest('[data-ann-slide]');
        if (slide && this.slides.length) {
          this.editorAnnLock = true;
          this.showSlide(this.slides.indexOf(slide));
        }
      }, o);

      document.addEventListener('shopify:block:deselect', (e) => {
        if (!this.contains(e.target)) return;
        this.editorLock = false;
        this.editorAnnLock = false;
        if (this.openItem) this.close(this.openItem, { force: true });
      }, o);

      document.addEventListener('shopify:section:deselect', (e) => {
        if (!this.section.contains(e.target) && e.target !== this.section) return;
        this.editorLock = false;
        if (this.openItem) this.close(this.openItem, { force: true });
        if (this.drawerOpen) this.closeDrawer(false);
      }, o);
    }
  }

  customElements.define('mega-header', MegaHeader);
})();