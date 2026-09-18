(() => {
  const EMAIL_KEY = 'brooks_preview_email';
  const EMAIL_QUESTION = "What's the best email address for us to reach you?";
  const PHONE_RE = /^what(?:'|’)?s the best phone number to reach you(?: on)?\??$/i;

  let active = false;
  let done = false;
  let phoneText = null;
  let phoneMessage = null;
  let conversation = null;
  let saved = null;

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function findPhoneText() {
    const nodes = [...document.querySelectorAll('p,span,div')].filter(visible);
    const matches = nodes.filter(el => PHONE_RE.test(clean(el.textContent)));
    return matches.find(el =>
      ![...el.children].some(child => PHONE_RE.test(clean(child.textContent)))
    ) || matches[0] || null;
  }

  function findConversation(node) {
    return node?.closest(
      '#conversation,[role="log"][aria-label*="conversation" i],[role="log"],.conversation,[class*="conversation"]'
    ) || null;
  }

  function directChild(root, node) {
    if (!root || !node) return null;
    let current = node;
    while (current.parentElement && current.parentElement !== root) {
      current = current.parentElement;
    }
    return current.parentElement === root ? current : null;
  }

  function findInput() {
    const preferred = document.querySelector('#message-input');
    if (preferred && visible(preferred) && !preferred.disabled && !preferred.readOnly) return preferred;

    return [...document.querySelectorAll(
      'textarea,input[type="text"],input[type="email"],input[type="tel"],input:not([type])'
    )].find(el => visible(el) && !el.disabled && !el.readOnly) || null;
  }

  function findHint(input) {
    const area = input?.closest('form')?.parentElement || document;
    return area.querySelector?.('#input-hint,.composer-caption span,[class*="composer-caption"] span') || null;
  }

  function latestUserMessage(root) {
    const items = [...root.querySelectorAll(
      '.user-message,[data-message-role="user"],[data-role="user"],[class*="user-message"]'
    )];
    return items.length ? items[items.length - 1] : null;
  }

  function removeIds(root) {
    if (root.id) root.removeAttribute('id');
    root.querySelectorAll?.('[id]').forEach(el => el.removeAttribute('id'));
  }

  function setBubbleText(root, value) {
    const p = root.querySelector?.('p');
    if (p) {
      p.textContent = value;
      return true;
    }

    const leaves = [...root.querySelectorAll?.('span,div') || []].filter(el =>
      !el.children.length && clean(el.textContent)
    );
    if (leaves.length) {
      leaves[leaves.length - 1].textContent = value;
      return true;
    }

    return false;
  }

  function restorePhoneQuestion() {
    if (phoneText?.isConnected && saved) {
      phoneText.textContent = saved.phoneText;
    }

    const input = saved?.input?.isConnected ? saved.input : findInput();
    if (input && saved) {
      input.value = '';
      input.setAttribute('placeholder', saved.placeholder);

      saved.inputmode === null
        ? input.removeAttribute('inputmode')
        : input.setAttribute('inputmode', saved.inputmode);

      saved.autocomplete === null
        ? input.removeAttribute('autocomplete')
        : input.setAttribute('autocomplete', saved.autocomplete);

      saved.maxlength === null
        ? input.removeAttribute('maxlength')
        : input.setAttribute('maxlength', saved.maxlength);

      input.removeAttribute('aria-invalid');
    }

    if (saved?.hint?.isConnected) {
      saved.hint.textContent = saved.hintText;
    }
  }

  function startEmailStep() {
    if (active || done) return;

    const text = findPhoneText();
    const input = findInput();
    if (!text || !input) return;

    const root = findConversation(text);
    if (!root) return;

    const message = directChild(root, text);
    if (!message) return;

    const userTemplate = latestUserMessage(root);
    if (!userTemplate) return;

    const hint = findHint(input);

    phoneText = text;
    phoneMessage = message;
    conversation = root;

    saved = {
      input,
      phoneText: text.textContent,
      placeholder: input.getAttribute('placeholder') || '',
      inputmode: input.getAttribute('inputmode'),
      autocomplete: input.getAttribute('autocomplete'),
      maxlength: input.getAttribute('maxlength'),
      hint,
      hintText: hint ? hint.textContent : '',
      userTemplate
    };

    active = true;

    phoneText.textContent = EMAIL_QUESTION;
    input.value = '';
    input.setAttribute('placeholder', 'name@example.com');
    input.setAttribute('inputmode', 'email');
    input.setAttribute('autocomplete', 'email');
    input.setAttribute('maxlength', '254');
    input.removeAttribute('aria-invalid');

    if (hint) hint.textContent = 'Enter your email address.';

    input.focus();
  }

  function finishEmailStep(email) {
    const template = saved?.userTemplate;
    if (!template || !conversation || !phoneMessage) return;

    const answer = template.cloneNode(true);
    removeIds(answer);
    answer.setAttribute('data-brooks-email-answer', 'true');

    if (!setBubbleText(answer, email)) return;

    conversation.insertBefore(answer, phoneMessage);

    try {
      sessionStorage.setItem(EMAIL_KEY, email);
    } catch {}
    window.__brooksCapturedEmail = email;

    restorePhoneQuestion();

    active = false;
    done = true;

    const input = findInput();
    if (input) input.focus();

    try {
      phoneMessage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {}
  }

  document.addEventListener('submit', event => {
    if (!active) return;

    const input = findInput();
    if (!input) return;

    const form = input.closest('form');
    if (form && event.target !== form) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const email = clean(input.value);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      input.setAttribute('aria-invalid', 'true');
      if (saved?.hint?.isConnected) saved.hint.textContent = 'Enter a valid email address.';
      input.focus();
      return;
    }

    finishEmailStep(email);
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;

    const label = clean(button.textContent);

    if (active && /^(undo|back)$/i.test(label)) {
      restorePhoneQuestion();
      active = false;
      done = false;
      phoneText = null;
      phoneMessage = null;
      conversation = null;
      saved = null;
      return;
    }

    if (/try another conversation|start over/i.test(label)) {
      try {
        sessionStorage.removeItem(EMAIL_KEY);
      } catch {}
      delete window.__brooksCapturedEmail;
      active = false;
      done = false;
      phoneText = null;
      phoneMessage = null;
      conversation = null;
      saved = null;
    }
  }, true);

  new MutationObserver(() => {
    if (!active && !done) queueMicrotask(startEmailStep);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  startEmailStep();
})();
