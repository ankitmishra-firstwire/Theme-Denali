/**
 * Denali cart page: updates quantities, removes items and saves the
 * cart note with the Ajax Cart API, then re-renders the cart section
 * so discounts, selling plans and totals always come from Shopify.
 * Without JavaScript the form still posts to /cart.
 */

(() => {
  const routes = () => (window.theme && window.theme.routes) || { cartChange: '/cart/change', cartUpdate: '/cart/update' };
  const strings = () => (window.theme && window.theme.strings) || {};

  if (customElements.get('cart-items')) return;

  customElements.define('cart-items', class CartItems extends HTMLElement {
    connectedCallback() {
      this.sectionId = this.dataset.sectionId;
      const debounce = window.DenaliTheme?.debounce || ((fn) => fn);

      this.onQuantityChange = debounce((input) => {
        this.changeLine(Number(input.dataset.index), Number(input.value), input.id);
      }, 300);

      this.addEventListener('change', (event) => {
        if (event.target.matches('[data-cart-quantity]')) this.onQuantityChange(event.target);
      });

      this.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-cart-remove]');
        if (!remove) return;
        event.preventDefault();
        this.changeLine(Number(remove.dataset.cartRemove), 0);
      });

      const note = this.querySelector('[data-cart-note]');
      note?.addEventListener('input', debounce(() => {
        fetch(`${routes().cartUpdate}.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ note: note.value })
        }).catch(() => {});
      }, 500));
    }

    changeLine(line, quantity, focusId) {
      this.setAttribute('aria-busy', 'true');
      this.classList.add('is-loading');

      fetch(`${routes().cartChange}.js`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ line, quantity, sections: [this.sectionId], sections_url: window.location.pathname })
      })
        .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
        .then(({ ok, data }) => {
          if (!ok || data.status) {
            throw new Error(data.description || data.message || strings().cartError);
          }

          const sectionHtml = data.sections && data.sections[this.sectionId];
          if (sectionHtml) {
            const html = new DOMParser().parseFromString(sectionHtml, 'text/html');
            const fresh = html.querySelector('[data-cart-contents]');
            const current = this.querySelector('[data-cart-contents]');
            if (fresh && current) current.innerHTML = fresh.innerHTML;
          }

          document.dispatchEvent(new CustomEvent('cart:updated', { detail: { item_count: data.item_count } }));

          if (window.Shopify && window.Shopify.PaymentButton) window.Shopify.PaymentButton.init();

          const focusTarget = focusId && document.getElementById(focusId);
          if (focusTarget) {
            focusTarget.focus();
          } else {
            this.querySelector('h1')?.setAttribute('tabindex', '-1');
            this.querySelector('h1')?.focus();
          }
        })
        .catch((error) => {
          const lineError = document.getElementById(`LineItemError-${line}`);
          if (lineError) {
            lineError.textContent = error.message;
            lineError.hidden = false;
          }
        })
        .finally(() => {
          this.removeAttribute('aria-busy');
          this.classList.remove('is-loading');
        });
    }
  });
})();
