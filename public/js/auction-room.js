(() => {
  const key = 'ironlot-comparison-v1';
  let selected = [];
  try { const value = JSON.parse(localStorage.getItem(key) || '[]'); if(Array.isArray(value)) selected = value.filter(x => x && typeof x.slug === 'string' && typeof x.title === 'string').slice(0,3); } catch (_) {}
  const tray = document.querySelector('[data-compare-tray]');
  const feedback = document.querySelector('[data-compare-feedback]');
  const render = () => {
    tray.hidden = !selected.length;
    document.body.classList.toggle('has-compare-tray', !!selected.length);
    document.querySelector('[data-compare-count]').textContent = selected.length + ' machines selected';
    document.querySelector('[data-compare-names]').textContent = selected.map(x=>x.title).join(' · ');
    document.querySelector('[data-compare-link]').href = '/compare?lots=' + encodeURIComponent(selected.map(x=>x.slug).join(','));
    document.querySelectorAll('[data-compare-slug]').forEach(button => { const active = selected.some(x=>x.slug === button.dataset.compareSlug); button.setAttribute('aria-pressed', String(active)); button.textContent = active ? '✓ Selected · remove' : '+ Compare machine'; });
    try { localStorage.setItem(key, JSON.stringify(selected)); } catch (_) {}
  };
  document.querySelectorAll('[data-compare-slug]').forEach(button => button.addEventListener('click', () => {
    const slug = button.dataset.compareSlug;
    if (selected.some(x=>x.slug === slug)) selected = selected.filter(x=>x.slug !== slug);
    else if (selected.length < 3) selected.push({slug,title:button.dataset.compareTitle});
    else { feedback.textContent = 'Your shortlist is full. Remove a machine to add another.'; button.textContent = 'Limit: 3 machines · remove one first'; return; }
    feedback.textContent = selected.length + ' machines in your comparison.'; render();
  }));
  document.querySelector('[data-compare-clear]').addEventListener('click', () => { selected=[]; render(); });
  render();
  const filter = document.querySelector('[data-auction-window]');
  if(filter) { const update = () => {let visible=0;document.querySelectorAll('[data-auction-end]').forEach(card=>{const remaining=new Date(card.dataset.auctionEnd).getTime()-Date.now();const show=remaining>0&&(filter.value==='all'||remaining<=Number(filter.value)*3600000);card.hidden=!show;if(show)visible++;});document.querySelector('[data-room-empty]').hidden=visible>0;};filter.addEventListener('change',update);update();setInterval(update,30000); }
})();
