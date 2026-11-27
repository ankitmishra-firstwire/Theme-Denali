/*
  Cart drawer
  - Opens from any element with [data-cart-drawer-toggle] (or Dawn's #cart-icon-bubble)
  - Intercepts product forms posting to /cart/add and adds via AJAX
  - Re-renders itself with the Section Rendering API after every change
  - Other scripts can refresh it with:
      document.dispatchEvent(new CustomEvent('cart:refresh', { detail: { open: true } }));
  - Fires `cart:updated` on document with { itemCount } after every change
*/

if (!customElements.get('cc-cart-drawer')) {
  class CCCartDrawer extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('dialog');
      this.status = this.querySelector('[data-cart-status]');
      this.sectionId = this.dataset.sectionId;
      this.routes = {
        add: `${this.dataset.addUrl}.js`,
        change: `${this.dataset.changeUrl}.js`,
        update: `${this.dataset.updateUrl}.js`,
        root: this.dataset.rootUrl.replace(/\/$/, ''),
      };
      this.timers = {};
      this.queue = Promise.resolve();

      this.addEventListener('click', this.onClick);
      this.addEventListener('change', this.onChange);
      this.addEventListener('input', this.onInput);
      this.dialog.addEventListener('cancel', this.onCancel);
      this.dialog.addEventListener('click', this.onBackdropClick);

      document.addEventListener('click', this.onDocumentClick);
      document.addEventListener('submit', this.onDocumentSubmit);
      document.addEventListener('cart:refresh', this.onRefreshRequest);
      document.addEventListener('shopify:section:select', this.onEditorSelect);
      document.addEventListener('shopify:section:deselect', this.onEditorDeselect);
      document.addEventListener('shopify:section:load', this.onEditorSelect);
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.onDocumentClick);
      document.removeEventListener('submit', this.onDocumentSubmit);
      document.removeEventListener('cart:refresh', this.onRefreshRequest);
      document.removeEventListener('shopify:section:select', this.onEditorSelect);
      document.removeEventListener('shopify:section:deselect', this.onEditorDeselect);
      document.removeEventListener('shopify:section:load', this.onEditorSelect);
      document.documentElement.classList.remove('cc-cart-drawer-open');
    }

    get content() {
      return this.querySelector('[data-drawer-content]');
    }

    /* Open / close --------------------------------------------------- */

    open(opener) {
      if (this.dialog.open) return;
      this.opener = opener || document.activeElement;
      this.dialog.showModal();
      document.documentElement.classList.add('cc-cart-drawer-open');
    }

    close() {
      if (!this.dialog.open || this.closing) return;
      this.closing = true;
      this.dialog.classList.add('is-closing');

      const finish = (event) => {
        if (event && event.target !== this.dialog) return;
        clearTimeout(fallback);
        this.dialog.removeEventListener('animationend', finish);
        this.dialog.classList.remove('is-closing');
        this.dialog.close();
        document.documentElement.classList.remove('cc-cart-drawer-open');
        this.closing = false;
        if (this.opener && document.contains(this.opener)) this.opener.focus();
      };

      const fallback = setTimeout(finish, 400);
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
      else this.dialog.addEventListener('animationend', finish);
    }

    onCancel = (event) => {
      event.preventDefault();
      this.close();
    };

    onBackdropClick = (event) => {
      // The inner wrapper fills the panel, so only backdrop clicks land on the dialog itself
      if (event.target === this.dialog) this.close();
    };

    onDocumentClick = (event) => {
      const toggle = event.target.closest('[data-cart-drawer-toggle], #cart-icon-bubble');
      if (!toggle || this.contains(toggle)) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
      event.preventDefault();
      this.open(toggle);
    };

    onEditorSelect = (event) => {
      if (event.detail?.sectionId === this.sectionId) this.open();
    };

    onEditorDeselect = (event) => {
      if (event.detail?.sectionId === this.sectionId) this.close();
    };

    onRefreshRequest = async (event) => {
      await this.refresh();
      if (event.detail?.open) this.open();
    };

    /* Add to cart ---------------------------------------------------- */

    onDocumentSubmit = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
      if (form.hasAttribute('data-cart-drawer-ignore')) return;

      let path;
      try {
        path = new URL(form.action, window.location.origin).pathname;
      } catch {
        return;
      }
      if (!path.endsWith('/cart/add')) return;

      event.preventDefault();
      this.addFromForm(form, event.submitter);
    };

    async addFromForm(form, submitter) {
      const button = submitter || form.querySelector('[type="submit"]');
      this.setFormError(form, '');
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      }

      const body = new FormData(form);
      body.append('sections', this.sectionId);
      body.append('sections_url', window.location.pathname);

      try {
        const response = await fetch(this.routes.add, {
          method: 'POST',
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          body,
        });
        const data = await response.json();

        if (!response.ok || data.status) {
          this.setFormError(form, data.description || data.message || this.dataset.errorMessage);
          return;
        }

        this.render(data.sections?.[this.sectionId]);
        if (this.dataset.openOnAdd === 'true') this.open(button);
      } catch {
        this.setFormError(form, this.dataset.errorMessage);
      } finally {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    }

    setFormError(form, message) {
      let el = form.querySelector('[data-cart-drawer-error]');
      if (!message) {
        if (el) el.hidden = true;
        return;
      }
      if (!el) {
        el = document.createElement('p');
        el.className = 'cc-form-error';
        el.setAttribute('role', 'alert');
        el.dataset.cartDrawerError = '';
        form.append(el);
      }
      el.textContent = message;
      el.hidden = false;
    }

    /* Quantity, remove, note ----------------------------------------- */

    onClick = (event) => {
      if (event.target.closest('[data-drawer-close]')) {
        this.close();
        return;
      }

      const stepButton = event.target.closest('[data-qty-step]');
      if (stepButton) {
        const line = stepButton.dataset.line;
        const input = this.querySelector(`#CartDrawerQty-${line}`);
        if (!input) return;
        const step = Number(input.step) || 1;
        const max = input.max ? Number(input.max) : Infinity;
        const next = Number(input.value) + Number(stepButton.dataset.qtyStep) * step;
        input.value = Math.min(max, Math.max(0, next));
        this.scheduleChange(line, Number(input.value));
        return;
      }

      const removeButton = event.target.closest('[data-remove-line]');
      if (removeButton) this.changeLine(removeButton.dataset.removeLine, 0);
    };

    onChange = (event) => {
      const input = event.target.closest('[data-qty-input]');
      if (input) this.scheduleChange(input.dataset.line, Math.max(0, Number(input.value) || 0));
    };

    onInput = (event) => {
      const note = event.target.closest('[data-cart-note]');
      if (!note) return;
      clearTimeout(this.timers.note);
      this.timers.note = setTimeout(() => {
        fetch(this.routes.update, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ note: note.value }),
        }).catch(() => {});
      }, 500);
    };

    scheduleChange(line, quantity) {
      clearTimeout(this.timers[line]);
      this.timers[line] = setTimeout(() => this.changeLine(line, quantity), 350);
    }

    changeLine(line, quantity) {
      clearTimeout(this.timers[line]);
      // Requests run one at a time so line numbers stay accurate
      this.queue = this.queue.then(() => this.requestChange(line, quantity)).catch(() => {});
      return this.queue;
    }

    async requestChange(line, quantity) {
      const item = this.querySelector(`[data-line="${line}"].cc-line`);
      item?.classList.add('is-updating');
      this.content?.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(this.routes.change, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            line: Number(line),
            quantity,
            sections: [this.sectionId],
            sections_url: window.location.pathname,
          }),
        });
        const data = await response.json();

        if (!response.ok || data.status) {
          await this.refresh();
          this.showLineError(line, data.description || data.message || this.dataset.errorMessage);
          return;
        }

        this.render(data.sections?.[this.sectionId]);
      } catch {
        await this.refresh();
        this.showLineError(line, this.dataset.errorMessage);
      }
    }

    showLineError(line, message) {
      const el = this.querySelector(`#CartDrawerLineError-${line}`);
      if (!el) return;
      el.textContent = message;
      el.hidden = false;
    }

    /* Rendering ------------------------------------------------------ */

    async refresh() {
      try {
        const response = await fetch(`${this.routes.root}/?sections=${this.sectionId}`);
        const data = await response.json();
        this.render(data[this.sectionId]);
      } catch {
        /* keep the current contents */
      }
    }

    render(html) {
      if (!html) return;
      const next = new DOMParser().parseFromString(html, 'text/html').querySelector('[data-drawer-content]');
      const current = this.content;
      if (!next || !current) return;

      const activeId = this.contains(document.activeElement) ? document.activeElement.id : null;
      const previousGoal = current.querySelector('[data-goal-fill]')?.style.getPropertyValue('--goal');

      current.replaceWith(next);

      // Animate the goal bar from its old value to the new one
      const fill = next.querySelector('[data-goal-fill]');
      if (fill && previousGoal) {
        const target = fill.style.getPropertyValue('--goal');
        fill.style.setProperty('--goal', previousGoal);
        void fill.offsetWidth;
        fill.style.setProperty('--goal', target);
      }

      // Keep keyboard focus in a sensible place after the swap
      if (activeId && this.dialog.open) {
        const target = document.getElementById(activeId) || next.querySelector('[data-drawer-close]');
        target?.focus();
      }

      this.syncCount(next.dataset.itemCount);
      this.announce(next);
    }

    syncCount(count) {
      document.querySelectorAll('[data-cart-count]').forEach((el) => {
        el.textContent = count;
        el.hidden = count === '0';
      });
      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { itemCount: Number(count) } }));
    }

    announce(content) {
      if (!this.status) return;
      const total = content.querySelector('[data-cart-total]')?.textContent.trim();
      this.status.textContent = '';
      if (total) {
        setTimeout(() => {
          this.status.textContent = `${this.dataset.totalLabel}: ${total}`;
        }, 100);
      }
    }
  }

  customElements.define('cc-cart-drawer', CCCartDrawer);
}