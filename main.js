import './wallet-navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  const burger = document.querySelector('.mobile-burger');
  const overlay = document.querySelector('.mobile-overlay');
  const sheet = document.querySelector('.mobile-sheet');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link, .mobile-sign-in');

  const closeMenu = () => {
    if (!burger || !overlay || !sheet) return;
    burger.setAttribute('aria-expanded', 'false');
    overlay.classList.remove('open');
    sheet.classList.remove('open');
    document.body.classList.remove('menu-open');
  };

  if (burger && overlay && sheet) {
    burger.addEventListener('click', () => {
      const isOpen = burger.getAttribute('aria-expanded') === 'true';
      burger.setAttribute('aria-expanded', String(!isOpen));
      overlay.classList.toggle('open', !isOpen);
      sheet.classList.toggle('open', !isOpen);
      document.body.classList.toggle('menu-open', !isOpen);
    });
    overlay.addEventListener('click', closeMenu);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });
    window.addEventListener('resize', () => {
      if (window.innerWidth > 720) closeMenu();
    });
  }

  mobileLinks.forEach((link) => link.addEventListener('click', closeMenu));

  const accountLinks = [
    ...document.querySelectorAll('a.account-link'),
    ...document.querySelectorAll('a.mobile-sign-in'),
  ];
  fetch('/api/auth/get-session', { credentials: 'include' })
    .then((response) => response.ok ? response.json() : null)
    .then((session) => {
      const signedIn = Boolean(session?.user);
      const displayName = session?.user?.name?.trim() || session?.user?.email?.split('@')[0] || 'Account';
      accountLinks.forEach((link) => {
        link.href = signedIn ? 'profile.html' : 'auth.html';
        link.textContent = signedIn ? displayName : 'Sign in';
        if (signedIn) link.setAttribute('aria-label', `Open ${displayName}'s profile`);
      });
    })
    .catch(() => {
      accountLinks.forEach((link) => {
        link.href = 'auth.html';
        link.textContent = 'Sign in';
      });
    });
});
