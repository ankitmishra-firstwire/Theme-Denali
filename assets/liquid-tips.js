/* Rotate the translated tip text locally without requiring Shopify's experimental partial renderer. */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-liquid-tips]').forEach((card) => {
    const button = card.querySelector('[data-refresh-tip]');
    const output = card.querySelector('[data-tip-text]');
    const keys = (card.dataset.tipValues || '').split('|').filter(Boolean);
    if (!button || !output || keys.length < 2) return;
    let index = Math.max(0, keys.indexOf(output.textContent.trim()));
    button.addEventListener('click', () => {
      index = (index + 1) % keys.length;
      output.textContent = keys[index];
    });
  });
});
