/**
 * components/card.js — KHub Boilerplate
 * Card factory.
 * Usage: KHub.Components.Card.create({ title, body, footer })
 * All args accept strings or DOM nodes.
 */
(function () {
  'use strict';

  function create({ title = '', body = '', footer = null } = {}) {
    const card = document.createElement('article');
    card.className = 'card';

    if (title) {
      const h = document.createElement('h3');
      h.className = 'card-title';
      h.textContent = title;
      card.appendChild(h);
    }

    const bodyEl = document.createElement('div');
    bodyEl.className = 'card-body';
    if (typeof body === 'string') bodyEl.innerHTML = body;
    else bodyEl.appendChild(body);
    card.appendChild(bodyEl);

    if (footer) {
      const footerEl = document.createElement('div');
      footerEl.className = 'card-footer';
      if (typeof footer === 'string') footerEl.innerHTML = footer;
      else footerEl.appendChild(footer);
      card.appendChild(footerEl);
    }

    return card;
  }

  window.KHub = window.KHub || {};
  window.KHub.Components = window.KHub.Components || {};
  window.KHub.Components.Card = { create };
})();

