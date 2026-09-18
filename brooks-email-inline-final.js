(() => {
  const EMAIL_KEY = 'brooks_preview_email';
  const EMAIL_QUESTION = "What's the best email address for us to reach you?";
  const PHONE_RE = /what(?:'|’)?s\s+the\s+best\s+(?:phone|mobile)\s+number\s+to\s+reach\s+you(?:\s+on)?\??/i;

  let active = false;
  let phoneTextEl = null;
  let phoneMessage = null;
  let savedPhoneText = '';
  let savedInput = null;
  let savedHint = null;
  let savedHintText = '';

  const clean = v => String(v || '').replace(/\s+/g, ' ').trim();
  const visible = el => !!el && !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function getEmail() {
    try { return sessionStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
  }

  function setEmail(email) {
    try { sessionStorage.setItem(EMAIL_KEY, email); } catch {}
    window.__brooksCapturedEmail = email;
  }

  function clearEmail() {
    try { sessionStorage.removeItem(EMAIL_KEY); } catch {}
    delete window.__brooksCapturedEmail;
  }

  function getConversation() {
    return document.querySelector('#conversation');
  }

  function getInput() {
    const direct = document.querySelector('#message-input');
    if (direct && visible(direct) && !direct.disabled && !direct.readOnly) return direct;
    return [...document.querySelectorAll('textarea,input[type="text"],input[type="email"],input[type="tel"]')]
      .find(el => visible(el) && !el.disabled && !el.readOnly) || null;
  }

  function getHint(input) {
    const area = input?.closest('form')?.parentElement || document;
    return area.querySelector('#input-hint,.composer-caption span,[class*="composer-caption"] span');
  }

  function findPhoneText() {
    const conversation = getConversation();
    if (!conversation) return null;
    const nodes = [...conversation.querySelectorAll('p,span,div')].filter(visible);
    const matches = nodes.filter(el => PHONE_RE.test(clean(el.textContent)));
    return matches.find(el => ![...el.children].some(child => PHONE_RE.test(clean(child.textContent)))) || null;
  }

  function stripIds(root) {
    if (root.id) root.removeAttribute('id');
    root.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
  }

  function replaceBubbleText(root, text) {
    const p = root.querySelector('p');
    if (p) {
      p.textContent = text;
      return true;
    }
    const leaves = [...root.querySelectorAll('span,div')].filter(el => !el.children.length && clean(el.textContent));
    if (!leaves.length) return false;
    leaves[leaves.length - 1].textContent = text;
    return true;
  }

  function latestUserMessage(conversation) {
    const items = [...conversation.querySelectorAll('.user-message')];
    return items.length ? items[items.length - 1] : null;
  }

  function restoreComposer() {
    const input = savedInput?.input?.isConnected ? savedInput.input : getInput();
    if (input && savedInput) {
      input.value = '';
      input.setAttribute('placeholder', savedInput.placeholder);
      savedInput.inputmode === null ? input.removeAttribute('inputmode') : input.setAttribute('inputmode', savedInput.inputmode);
      savedInput.autocomplete === null ? input.removeAttribute('autocomplete') : input.setAttribute('autocomplete', savedInput.autocomplete);
      savedInput.maxlength === null ? input.removeAttribute('maxlength') : input.setAttribute('maxlength', savedInput.maxlength);
      input.removeAttribute('aria-invalid');
    }
    if (savedHint?.isConnected) savedHint.textContent = savedHintText;
  }

  function startEmailStep() {
    if (active || getEmail()) return;

    const conversation = getConversation();
    const textEl = findPhoneText();
    const input = getInput();
    if (!conversation || !textEl || !input) return;

    const message = textEl.closest('.assistant-message');
    if (!message || message.parentElement !== conversation) return;

    const hint = getHint(input);

    phoneTextEl = textEl;
    phoneMessage = message;
    savedPhoneText = textEl.textContent;
    savedInput = {
      input,
      placeholder: input.getAttribute('placeholder') || '',
      inputmode: input.getAttribute('inputmode'),
      autocomplete: input.getAttribute('autocomplete'),
      maxlength: input.getAttribute('maxlength')
    };
    savedHint = hint;
    savedHintText = hint ? hint.textContent : '';

    active = true;

    phoneTextEl.textContent = EMAIL_QUESTION;
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
    const conversation = getConversation();
    if (!conversation || !phoneMessage || !phoneTextEl) return;

    const emailPrompt = phoneMessage.cloneNode(true);
    stripIds(emailPrompt);
    emailPrompt.setAttribute('data-brooks-email-question', 'true');
    replaceBubbleText(emailPrompt, EMAIL_QUESTION);

    const template = latestUserMessage(conversation);
    let emailAnswer;
    if (template) {
      emailAnswer = template.cloneNode(true);
      stripIds(emailAnswer);
      emailAnswer.setAttribute('data-brooks-email-answer', 'true');
      replaceBubbleText(emailAnswer, email);
    } else {
      emailAnswer = document.createElement('div');
      emailAnswer.className = 'user-message';
      emailAnswer.setAttribute('data-brooks-email-answer', 'true');
      emailAnswer.innerHTML = '<div class="bubble"><p></p></div>';
      emailAnswer.querySelector('p').textContent = email;
    }

    conversation.insertBefore(emailPrompt, phoneMessage);
    conversation.insertBefore(emailAnswer, phoneMessage);

    phoneTextEl.textContent = savedPhoneText;
    setEmail(email);
    restoreComposer();
    active = false;

    const input = getInput();
    if (input) input.focus();
  }

  function addEmailToReview() {
    const email = getEmail();
    if (!email || document.querySelector('[data-brooks-email-review="true"]')) return;

    const headings = [...document.querySelectorAll('h1,h2,h3,h4,strong,div,p')];
    const heading = headings.find(el => clean(el.textContent) === 'Your contact request');
    if (!heading) return;

    let card = heading;
    for (let i = 0; i < 7 && card; i++, card = card.parentElement) {
      const button = [...card.querySelectorAll?.('button') || []].find(btn => /preview my contact request/i.test(clean(btn.textContent)));
      if (!button) continue;

      const leaves = [...card.querySelectorAll('p,div,span')].filter(el => {
        if (el.children.length) return false;
        const t = clean(el.textContent);
        return /\d{7,}/.test(t.replace(/\D/g, ''));
      });

      const phoneLine = leaves[0];
      if (phoneLine) {
        const emailLine = phoneLine.cloneNode(true);
        emailLine.setAttribute('data-brooks-email-review', 'true');
        emailLine.textContent = email;
        phoneLine.insertAdjacentElement('afterend', emailLine);
      } else {
        const emailLine = document.createElement('div');
        emailLine.setAttribute('data-brooks-email-review', 'true');
        emailLine.textContent = email;
        emailLine.style.marginTop = '4px';
        emailLine.style.color = 'inherit';
        heading.insertAdjacentElement('afterend', emailLine);
      }
      return;
    }
  }

  document.addEventListener('submit', event => {
    if (!active) return;

    const input = getInput();
    if (!input) return;
    const form = input.closest('form');
    if (form && event.target !== form) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const email = clean(input.value);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      input.setAttribute('aria-invalid', 'true');
      if (savedHint?.isConnected) savedHint.textContent = 'Enter a valid email address.';
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
      if (phoneTextEl?.isConnected) phoneTextEl.textContent = savedPhoneText;
      restoreComposer();
      active = false;
      return;
    }

    if (/try another conversation|start over/i.test(label)) {
      clearEmail();
      active = false;
      phoneTextEl = null;
      phoneMessage = null;
      savedPhoneText = '';
      document.querySelectorAll('[data-brooks-email-review="true"]').forEach(el => el.remove());
    }
  }, true);

  new MutationObserver(() => {
    queueMicrotask(() => {
      startEmailStep();
      addEmailToReview();
    });
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  startEmailStep();
  addEmailToReview();
})();
