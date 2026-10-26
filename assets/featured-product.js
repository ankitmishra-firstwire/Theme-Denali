(() => {
  function initFeaturedProduct(section) {
    if (section.dataset.initialized === 'true') return;

    const form = section.querySelector('.featured-product__form');
    const variantData = section.querySelector('[data-product-variants]');

    if (!form || !variantData) return;

    let variants;

    try {
      variants = JSON.parse(variantData.textContent);
    } catch (error) {
      console.error('Unable to read featured product variants.', error);
      return;
    }

    section.dataset.initialized = 'true';

    const variantInput = form.querySelector('[data-variant-id]');
    const optionSelects = Array.from(
      form.querySelectorAll('[data-option-position]')
    );
    const priceContainer = section.querySelector('[data-product-price]');
    const addButton = form.querySelector('[data-add-to-cart]');
    const buttonText = form.querySelector('[data-button-text]');
    const quantityInput = form.querySelector('[data-quantity-input]');
    const message = form.querySelector('[data-product-message]');
    const minusButton = form.querySelector('[data-quantity-minus]');
    const plusButton = form.querySelector('[data-quantity-plus]');

    const moneyFormat =
      window.Shopify?.money_format || '${{amount}}';

    function formatMoney(cents) {
      const amount = (Number(cents) / 100).toFixed(2);
      const parts = amount.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');

      const formatted = parts.join('.');

      return moneyFormat
        .replace(/\{\{\s*amount\s*\}\}/g, formatted)
        .replace(/\{\{\s*amount_no_decimals\s*\}\}/g, parts[0])
        .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/g, formatted.replace('.', ','))
        .replace(/\{\{\s*amount_no_decimals_with_comma_separator\s*\}\}/g, parts[0].replace(/,/g, '.'));
    }

    function selectedOptions() {
      return optionSelects.map((select) => select.value);
    }

    function findVariant() {
      const selected = selectedOptions();

      return variants.find((variant) => {
        return variant.options.every((option, index) => {
          return option === selected[index];
        });
      });
    }

    function updateVariant() {
      const variant = findVariant();

      if (!variant) {
        variantInput.value = '';

        addButton.disabled = true;
        buttonText.textContent = 'Unavailable';

        message.textContent = 'This combination is unavailable.';
        return;
      }

      variantInput.value = variant.id;
      message.textContent = '';

      const currentPrice = priceContainer.querySelector(
        '.featured-product__current-price'
      );

      if (currentPrice) {
        currentPrice.textContent = formatMoney(variant.price);
      }

      let comparePrice = priceContainer.querySelector(
        '.featured-product__compare-price'
      );

      if (variant.compare_at_price && variant.compare_at_price > variant.price) {
        if (!comparePrice) {
          comparePrice = document.createElement('span');
          comparePrice.className = 'featured-product__compare-price';
          priceContainer.prepend(comparePrice);
        }

        comparePrice.textContent = formatMoney(variant.compare_at_price);
      } else if (comparePrice) {
        comparePrice.remove();
      }

      addButton.disabled = !variant.available;

      buttonText.textContent = variant.available
        ? 'Add to cart'
        : 'Sold out';

      if (quantityInput) {
        quantityInput.min = variant.quantity_rule?.min || 1;
        quantityInput.step = variant.quantity_rule?.increment || 1;

        const minimum = Number(quantityInput.min);
        const step = Number(quantityInput.step);

        if (Number(quantityInput.value) < minimum) {
          quantityInput.value = minimum;
        }

        if (step > 0 && (Number(quantityInput.value) - minimum) % step !== 0) {
          quantityInput.value = minimum;
        }
      }

      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);

      window.history.replaceState({}, '', url);
    }

    optionSelects.forEach((select) => {
      select.addEventListener('change', updateVariant);
    });

    minusButton?.addEventListener('click', () => {
      if (!quantityInput) return;

      const min = Number(quantityInput.min) || 1;
      const step = Number(quantityInput.step) || 1;

      quantityInput.value = Math.max(
        min,
        (Number(quantityInput.value) || min) - step
      );
    });

    plusButton?.addEventListener('click', () => {
      if (!quantityInput) return;

      const min = Number(quantityInput.min) || 1;
      const step = Number(quantityInput.step) || 1;

      quantityInput.value =
        Math.max(min, Number(quantityInput.value) || min) + step;
    });

    quantityInput?.addEventListener('change', () => {
      const min = Number(quantityInput.min) || 1;
      const step = Number(quantityInput.step) || 1;
      let quantity = Number(quantityInput.value) || min;

      quantity = Math.max(min, quantity);

      quantityInput.value =
        min + Math.ceil((quantity - min) / step) * step;
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!variantInput.value) {
        message.textContent = 'Please select an available product variant.';
        return;
      }

      const originalText = buttonText.textContent;

      addButton.disabled = true;
      buttonText.textContent = 'Adding...';
      message.textContent = '';

      try {
        const response = await fetch(
          `${window.Shopify?.routes?.root || '/'}cart/add.js`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json'
            },
            body: JSON.stringify({
              items: [
                {
                  id: Number(variantInput.value),
                  quantity: Math.max(
                    1,
                    Number(quantityInput?.value) || 1
                  )
                }
              ]
            })
          }
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.description || result.message || 'Unable to add product.'
          );
        }

        buttonText.textContent = 'Added to cart';
        message.textContent = 'Product added to your cart.';

        document.dispatchEvent(
          new CustomEvent('cart:updated', { detail: result })
        );

        window.setTimeout(() => {
          buttonText.textContent = originalText;
          updateVariant();
        }, 1800);
      } catch (error) {
        message.textContent = error.message;
        buttonText.textContent = originalText;
        updateVariant();
      }
    });

    updateVariant();
  }

  function initAllFeaturedProducts() {
    document
      .querySelectorAll('.featured-product')
      .forEach(initFeaturedProduct);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllFeaturedProducts);
  } else {
    initAllFeaturedProducts();
  }

  document.addEventListener('shopify:section:load', (event) => {
    const section = event.target.matches('.featured-product')
      ? event.target
      : event.target.querySelector('.featured-product');

    if (section) initFeaturedProduct(section);
  });
})();