/**
 * Denali product scripts: variant selection, add to cart, gift card
 * recipient fields. Used by the main product and featured product sections.
 *
 * Variant changes on the product page re-render price, inventory, SKU,
 * buy buttons and pickup availability through the Section Rendering API,
 * so unit prices, selling plans and installments stay correct.
 */

(() => {
  const strings = () => (window.theme && window.theme.strings) || {};
  const routes = () => (window.theme && window.theme.routes) || { root: '/', cart: '/cart', cartAdd: '/cart/add' };

  /* ------------------------------------------------------------------ */
  /* <variant-picker>                                                    */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('variant-picker')) {
    customElements.define('variant-picker', class VariantPicker extends HTMLElement {
      connectedCallback() {
        const data = this.querySelector('[data-variants]');
        try {
          this.variants = data ? JSON.parse(data.textContent) : [];
        } catch (error) {
          this.variants = [];
        }
        this.addEventListener('change', this.onChange.bind(this));
        this.updateAvailability();
      }

      getSelectedOptions() {
        const selected = [];
        this.querySelectorAll('select[data-option-index]').forEach((select) => {
          selected[Number(select.dataset.optionIndex)] = select.value;
        });
        this.querySelectorAll('input[type="radio"][data-option-index]:checked').forEach((input) => {
          selected[Number(input.dataset.optionIndex)] = input.value;
        });
        return selected;
      }

      getCurrentVariant() {
        const selected = this.getSelectedOptions();
        return this.variants.find((variant) =>
          variant.options.every((value, index) => value === selected[index])
        ) || null;
      }

      onChange(event) {
        if (!event.target.matches('[data-option-index]')) return;

        const fieldset = event.target.closest('fieldset');
        const label = fieldset?.querySelector('[data-selected-value]');
        if (label) label.textContent = event.target.value;

        this.updateAvailability();
        const variant = this.getCurrentVariant();
        this.dispatchEvent(new CustomEvent('variant:change', { bubbles: true, detail: { variant } }));
      }

      /** Mark option values that have no available variant with the other current selections. */
      updateAvailability() {
        const selected = this.getSelectedOptions();
        this.querySelectorAll('input[type="radio"][data-option-index]').forEach((input) => {
          const index = Number(input.dataset.optionIndex);
          const available = this.variants.some((variant) =>
            variant.available &&
            variant.options[index] === input.value &&
            variant.options.every((value, i) => i === index || i > index || value === selected[i])
          );
          const labelEl = this.querySelector(`label[for="${input.id}"]`);
          labelEl?.classList.toggle('is-unavailable', !available);
          const hint = labelEl?.querySelector('[data-unavailable-label]');
          if (hint) hint.hidden = available;
        });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <product-info>                                                      */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('product-info')) {
    customElements.define('product-info', class ProductInfo extends HTMLElement {
      connectedCallback() {
        this.sectionId = this.dataset.sectionId;
        this.formId = this.dataset.productFormId;
        this.abortController = null;

        this.addEventListener('variant:change', (event) => this.onVariantChange(event.detail.variant));
        this.addEventListener('change', (event) => {
          if (event.target.name === 'selling_plan') this.onSellingPlanChange();
        });

        const priceData = this.querySelector('[data-variant-prices]');
        if (priceData) {
          try {
            this.variantPrices = JSON.parse(priceData.textContent);
          } catch (error) {
            this.variantPrices = {};
          }
        }
      }

      get form() {
        return document.getElementById(this.formId);
      }

      get variantInput() {
        return this.form?.querySelector('[data-variant-id]');
      }

      get sellingPlan() {
        return this.form?.querySelector('input[name="selling_plan"]:checked')?.value || '';
      }

      onSellingPlanChange() {
        const variantId = this.variantInput?.value;
        if (variantId) this.renderSection(variantId);
      }

      onVariantChange(variant) {
        const input = this.variantInput;
        const button = this.form?.querySelector('[data-add-to-cart]');
        const buttonText = this.form?.querySelector('[data-add-to-cart-text]');

        if (!variant) {
          if (input) input.disabled = true;
          if (button) button.disabled = true;
          if (buttonText) buttonText.textContent = strings().unavailable || 'Unavailable';
          this.querySelectorAll('[data-update="price"], [data-update="inventory"], [data-update="sku"], [data-update="pickup"]').forEach((el) => {
            if (el.dataset.update !== 'price') el.innerHTML = '';
          });
          return;
        }

        if (input) {
          input.disabled = false;
          input.value = variant.id;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }

        if (variant.featured_media) {
          this.querySelector('media-gallery')?.setActiveMedia(variant.featured_media.id);
        }

        this.updateQuantityRules(variant);

        if (this.dataset.renderMode === 'client') {
          this.renderClient(variant);
          return;
        }

        const url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());

        this.renderSection(variant.id);
      }

      updateQuantityRules(variant) {
        const quantity = this.querySelector('[data-quantity-input]');
        const rule = variant.quantity_rule;
        if (!quantity || !rule) return;
        quantity.min = rule.min || 1;
        quantity.step = rule.increment || 1;
        if (rule.max) {
          quantity.max = rule.max;
        } else {
          quantity.removeAttribute('max');
        }
        if (Number(quantity.value) < Number(quantity.min)) quantity.value = quantity.min;
      }

      renderClient(variant) {
        const price = this.querySelector('[data-update="price"]');
        if (price && this.variantPrices && this.variantPrices[variant.id]) {
          price.innerHTML = this.variantPrices[variant.id];
        }
        const button = this.form?.querySelector('[data-add-to-cart]');
        const buttonText = this.form?.querySelector('[data-add-to-cart-text]');
        if (button) button.disabled = !variant.available;
        if (buttonText) buttonText.textContent = variant.available ? strings().addToCart : strings().soldOut;
      }

      renderSection(variantId) {
        if (this.abortController) this.abortController.abort();
        this.abortController = new AbortController();

        const params = new URLSearchParams({ variant: variantId, section_id: this.sectionId });
        if (this.sellingPlan) params.set('selling_plan', this.sellingPlan);
        const url = `${this.dataset.productUrl}?${params.toString()}`;

        fetch(url, { signal: this.abortController.signal })
          .then((response) => response.text())
          .then((text) => {
            const html = new DOMParser().parseFromString(text, 'text/html');
            ['price', 'inventory', 'sku', 'pickup', 'quantity-rules'].forEach((key) => {
              const current = this.querySelector(`[data-update="${key}"]`);
              const fresh = html.querySelector(`[data-update="${key}"]`);
              if (current && fresh) current.innerHTML = fresh.innerHTML;
            });

            const currentButtons = this.querySelector('[data-update="buy-buttons"]');
            const freshButtons = html.querySelector('[data-update="buy-buttons"]');
            if (currentButtons && freshButtons) {
              const freshAdd = freshButtons.querySelector('[data-add-to-cart]');
              const currentAdd = currentButtons.querySelector('[data-add-to-cart]');
              if (freshAdd && currentAdd) {
                currentAdd.disabled = freshAdd.disabled;
                currentAdd.querySelector('[data-add-to-cart-text]').textContent =
                  freshAdd.querySelector('[data-add-to-cart-text]').textContent;
              }
            }

            if (window.Shopify && window.Shopify.PaymentButton) {
              window.Shopify.PaymentButton.init();
            }
          })
          .catch((error) => {
            if (error.name !== 'AbortError') console.error(error);
          });
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <product-form>                                                      */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('product-form')) {
    customElements.define('product-form', class ProductForm extends HTMLElement {
      connectedCallback() {
        this.form = this.querySelector('form');
        this.error = this.querySelector('[data-form-error]');
        this.success = this.querySelector('[data-form-success]');
        this.form?.addEventListener('submit', this.onSubmit.bind(this));
      }

      onSubmit(event) {
        event.preventDefault();
        const button = this.form.querySelector('[data-add-to-cart]');
        const buttonText = this.form.querySelector('[data-add-to-cart-text]');
        if (!button || button.disabled) return;

        const recipient = this.form.querySelector('gift-card-recipient');
        if (recipient && !recipient.validate()) return;

        const originalText = buttonText.textContent;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        buttonText.textContent = strings().adding || originalText;
        this.hideMessages();

        const formData = new FormData(this.form);

        fetch(`${routes().cartAdd}.js`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: formData
        })
          .then((response) => response.json().then((data) => ({ ok: response.ok, data })))
          .then(({ ok, data }) => {
            if (!ok || data.status) {
              throw new Error(data.description || data.message || strings().cartError);
            }
            if (window.theme?.settings?.cartType === 'page') {
              window.location.href = routes().cart;
              return;
            }
            this.success.hidden = false;
            window.DenaliTheme?.announce(this.success.textContent.trim());
            document.dispatchEvent(new CustomEvent('cart:updated', { detail: { item: data } }));
          })
          .catch((error) => {
            this.error.textContent = error.message || strings().cartError;
            this.error.hidden = false;
          })
          .finally(() => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
            buttonText.textContent = originalText;
          });
      }

      hideMessages() {
        if (this.error) {
          this.error.hidden = true;
          this.error.textContent = '';
        }
        if (this.success) this.success.hidden = true;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* <gift-card-recipient>                                               */
  /* ------------------------------------------------------------------ */

  if (!customElements.get('gift-card-recipient')) {
    customElements.define('gift-card-recipient', class GiftCardRecipient extends HTMLElement {
      connectedCallback() {
        this.checkbox = this.querySelector('[data-recipient-checkbox]');
        this.fields = this.querySelector('[data-recipient-fields]');
        this.offset = this.querySelector('[data-recipient-offset]');
        if (this.offset) this.offset.value = new Date().getTimezoneOffset().toString();
        this.checkbox?.addEventListener('change', () => this.sync());
        this.sync();
      }

      sync() {
        const enabled = this.checkbox?.checked;
        if (this.fields) this.fields.hidden = !enabled;
        this.querySelectorAll('[data-recipient-field], [data-recipient-offset]').forEach((field) => {
          field.disabled = !enabled;
        });
      }

      validate() {
        if (!this.checkbox?.checked) return true;
        const email = this.querySelector('input[type="email"]');
        if (email && !email.checkValidity()) {
          email.setAttribute('aria-invalid', 'true');
          email.reportValidity();
          return false;
        }
        if (email && !email.value) {
          email.setAttribute('aria-invalid', 'true');
          email.focus();
          return false;
        }
        email?.removeAttribute('aria-invalid');
        return true;
      }
    });
  }
})();
