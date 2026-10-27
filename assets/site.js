const form = document.querySelector('form[role="search"]');
if (form) {
  const input = form.querySelector('input');
  const button = form.querySelector('button');
  button.type = 'button';
  button.setAttribute('aria-label', 'Expand search field');
  button.addEventListener('click', () => {
    if (form.classList.contains('wp-block-search__searchfield-hidden')) {
      form.classList.remove('wp-block-search__searchfield-hidden');
      input.removeAttribute('aria-hidden');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', 'Submit Search');
      input.focus();
    } else if (form.reportValidity()) form.requestSubmit();
  });
}
for (const nav of document.querySelectorAll('nav.wp-block-navigation')) {
  const panel = nav.querySelector('.wp-block-navigation__responsive-container');
  const open = nav.querySelector('.wp-block-navigation__responsive-container-open');
  const close = nav.querySelector('.wp-block-navigation__responsive-container-close');
  const setOpen = value => {
    panel.classList.toggle('is-menu-open', value);
    panel.classList.toggle('has-modal-open', value);
    open.setAttribute('aria-expanded', String(value));
    document.body.style.overflow = value ? 'hidden' : '';
    if (value) { panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Menu'); close.focus(); }
    else { panel.removeAttribute('role'); panel.removeAttribute('aria-modal'); open.focus(); }
  };
  open.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', e => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Tab' && panel.classList.contains('is-menu-open')) {
      const items = [...panel.querySelectorAll('a,button,input')].filter(el => el.getClientRects().length && el.getAttribute('aria-hidden') !== 'true');
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}
const query = new URLSearchParams(location.search).get('s');
if (query !== null) {
  const main = document.querySelector('main');
  if (main) {
    main.replaceChildren();
    const results = document.createElement('section');
    results.className = 'static-search-results';
    results.setAttribute('aria-live', 'polite');
    const heading = document.createElement('h1');
    heading.textContent = `Search results for: ${query}`;
    results.append(heading);
    main.append(results);
    fetch('/search.json').then(r => { if (!r.ok) throw new Error('Search unavailable'); return r.json(); }).then(posts => {
      const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
      const matches = terms.length ? posts.filter(p => terms.every(t => `${p.title} ${p.text}`.toLocaleLowerCase().includes(t))) : [];
      for (const post of matches) {
        const article = document.createElement('article');
        const title = document.createElement('h2');
        const link = document.createElement('a');
        link.href = post.url; link.textContent = post.title;
        title.append(link);
        const excerpt = document.createElement('p'); excerpt.textContent = post.text.slice(0, 300) + '…';
        article.append(title, excerpt); results.append(article);
      }
      if (!matches.length) { const p = document.createElement('p'); p.textContent = 'No results found.'; results.append(p); }
    }).catch(() => { const p = document.createElement('p'); p.textContent = 'Search is temporarily unavailable. Please try again.'; results.append(p); });
  }
}
