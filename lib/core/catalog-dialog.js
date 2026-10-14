// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared catalogue window. The browser handles modal focus and Escape.

import { icon } from './ui.js';

export function mountCatalogDialog(host, { onOpen } = {}) {
  const button = host.querySelector('[data-catalog-close]');
  if (button) button.innerHTML = String(icon('close'));
  const close = () => host.close();
  host.addEventListener('click', (event) => {
    if (event.target.closest('[data-catalog-close]')) close();
    else if (event.target === host) {
      const box = host.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close();
    }
  });
  return {
    open() {
      onOpen?.();
      if (!host.open) host.showModal();
    },
    close,
  };
}
