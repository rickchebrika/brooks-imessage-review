(() => {
  const QUESTION = "What's the best email address for us to reach you?";
  const EMAIL_KEY = 'brooks_preview_email';

  let armed = false;
  let active = false;
  let assistantCountBeforeName = 0;
  let phoneMessage = null;
  let phoneText = null;
  let phoneTextOriginal = '';
  let composerSnapshot = null;

  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();

  function conversation() {
    return document.querySelector('#conversation');
  }

  function input() {
    return document.querySelector('#message-input');
  }

  function hint() {
    return document.querySelector('#input-hint');
  }

  function assistants() {
    const root = conversation();
    return root ? Array.from(root.querySelectorAll(':scope > .assistant-message')) : [];
  }

  function users() {
    const root = conversation();
    return root ? Array.from(root.querySelectorAll(':scope > .user-message')) : [];
  }

  function latestAssistant() {
    const items = assistants();
    return items.length ? items[items.length - 1] : null;
  }

  function latestUser() {
    const items = users();
    return items.length ? items[items.length - 1] : null;
  }

  function bubbleParagraph(message) {
    return message?.querySelector('.bubble p') || message?.querySelector('p') || null;
  }

  function atNameStep() {
    const message = latestAssistant();
    const text = clean(message?.innerText || message?.textContent);
    const placeholder = clean(input()?.getAttribute('placeholder'));
    return /what name should our team ask for/i.test(text) || /first and last name/i.test(placeholder);
  }

  function snapshotComposer() {
    const field = input();
    if (!field) return null;
    const h = hint();
    return {
      field,
      placeholder: field.getAttribute('placeholder') || '',
      inputmode: field.getAttribute('inputmode'),
      autocomplete: field.getAttribute('autocomplete'),
      maxlength: field.getAttribute('maxlength'),
      hint: h,
      hintText: h ? h.textContent : ''
    };
  }

  function restoreComposer() {
    const s = composerSnapshot;
    const field = s?.field?.isConnected ? s.field : input();
    if (!field || !s) return;

    field.value = '';
    field.setAttribute('placeholder', s.placeholder);
    s.inputmode === null ? field.removeAttribute('inputmode') : field.setAttribute('inputmode', s.inputmode);
    s.autocomplete === null ? field.removeAttribute('autocomplete') : field.setAttribute('autocomplete', s.autocomplete);
    s.maxlength === null ? field.removeAttribute('maxlength') : field.setAttribute('maxlength', s.maxlength);
    field.removeAttribute('aria-invalid');

    if (s.hint?.isConnected) s.hint.textContent = s.hintText;
  }

  function removeIds(root) {
    if (!root) return;
    root.removeAttribute?.('id');
    root.querySelectorAll?.('[id]').forEach(el => el.removeAttribute('id'));
  }

  function setBubbleText(message, value) {
    const p = bubbleParagraph(message);
    if (!p) return false;
    p.textContent = value;
    return true;
  }

  function activateEmailStep() {
    if (!armed || active) return;

    const items = assistants();
    if (items.length <= assistantCountBeforeName) return;

    const next = items[items.length - 1];
    const p = bubbleParagraph(next);
    const field = input();
    if (!next || !p || !field) return;

    const nextText = clean(next.innerText || next.textContent);
    if (/what name should our team ask for/i.test(nextText)) return;

    phoneMessage = next;
    phoneText = p;
    phoneTextOriginal = p.textContent;
    composerSnapshot = snapshotComposer();

    active = true;
    armed = false;

    phoneText.textContent = QUESTION;
    field.value = '';
    field.setAttribute('placeholder', 'name@example.com');
    field.setAttribute('inputmode', 'email');
    field.setAttribute('autocomplete', 'email');
    field.setAttribute('maxlength', '254');
    field.removeAttribute('aria-invalid');

    const h = hint();
    if (h) h.textContent = 'Enter your email address.';
    field.focus();
  }

  function addEmailToReview(email) {
    if (!email || document.querySelector('[data-brooks-email-review="true"]')) return;

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,strong,p,div'));
    const heading = headings.find(el => clean(el.textContent) === 'Your contact request');
    if (!heading) return;

    let card = heading;
    for (let i = 0; i < 7 && card; i++, card = card.parentElement) {
      const previewButton = Array.from(card.querySelectorAll?.('button') || [])
        .find(btn => /preview my contact request/i.test(clean(btn.textContent)));
      if (!previewButton) continue;

      const leaves = Array.from(card.querySelectorAll('p,div,span')).filter(el => {
        if (el.children.length) return false;
        const digits = clean(el.textContent).replace(/\D/g, '');
        return digits.length >= 7;
      });

      const phoneLine = leaves[0];
      if (phoneLine) {
        const emailLine = phoneLine.cloneNode(true);
        removeIds(emailLine);
        emailLine.setAttribute('data-brooks-email-review', 'true');
        emailLine.textContent = email;
        phoneLine.insertAdjacentElement('afterend', emailLine);
      }
      return;
    }
  }

  function finishEmail(email) {
    const root = conversation();
    if (!root || !phoneMessage || !phoneText) return;

    const emailPrompt = phoneMessage.cloneNode(true);
    removeIds(emailPrompt);
    emailPrompt.setAttribute('data-brooks-email-question', 'true');
    setBubbleText(emailPrompt, QUESTION);

    const userTemplate = latestUser();
    if (!userTemplate) return;

    const emailAnswer = userTemplate.cloneNode(true);
    removeIds(emailAnswer);
    emailAnswer.setAttribute('data-brooks-email-answer', 'true');
    setBubbleText(emailAnswer, email);

    root.insertBefore(emailPrompt, phoneMessage);
    root.insertBefore(emailAnswer, phoneMessage);

    phoneText.textContent = phoneTextOriginal;
    restoreComposer();

    try { sessionStorage.setItem(EMAIL_KEY, email); } catch {}
    window.__brooksCapturedEmail = email;

    active = false;
    composerSnapshot = null;

    const field = input();
    if (field) field.focus();

    setTimeout(() => addEmailToReview(email), 0);
  }

  document.addEventListener('submit', event => {
    const field = input();
    if (!field) return;

    if (active) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const email = clean(field.value);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
        field.setAttribute('aria-invalid', 'true');
        const h = hint();
        if (h) h.textContent = 'Enter a valid email address.';
        field.focus();
        return;
      }

      finishEmail(email);
      return;
    }

    if (atNameStep()) {
      assistantCountBeforeName = assistants().length;
      armed = true;
      setTimeout(activateEmailStep, 0);
      setTimeout(activateEmailStep, 50);
      setTimeout(activateEmailStep, 150);
      setTimeout(activateEmailStep, 400);
    }
  }, true);

  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button) return;
    const label = clean(button.textContent);

    if (active && (button.id === 'back-button' || /^(undo|back)$/i.test(label))) {
      if (phoneText?.isConnected) phoneText.textContent = phoneTextOriginal;
      restoreComposer();
      active = false;
      armed = false;
      return;
    }

    if (/try another conversation|start over/i.test(label)) {
      try { sessionStorage.removeItem(EMAIL_KEY); } catch {}
      delete window.__brooksCapturedEmail;
      armed = false;
      active = false;
      assistantCountBeforeName = 0;
      phoneMessage = null;
      phoneText = null;
      phoneTextOriginal = '';
      composerSnapshot = null;
      document.querySelectorAll('[data-brooks-email-review="true"]').forEach(el => el.remove());
    }
  }, true);

  new MutationObserver(() => {
    if (armed && !active) queueMicrotask(activateEmailStep);
    const email = (() => { try { return sessionStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; } })();
    if (email) queueMicrotask(() => addEmailToReview(email));
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
