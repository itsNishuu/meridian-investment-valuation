// Shows a one-line pointer to the plain-English guide until the visitor dismisses it.
const KEY = 'meridian-investment-valuation:guide-dismissed';
const banner = document.getElementById('welcome');
if (banner) {
  let dismissed = false;
  try { dismissed = localStorage.getItem(KEY) === '1'; } catch { /* storage unavailable: show the banner */ }
  banner.hidden = dismissed;
  banner.querySelector('button')?.addEventListener('click', () => {
    banner.hidden = true;
    try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
  });
}
