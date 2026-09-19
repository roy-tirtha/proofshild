document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Menu Logic
  const burger = document.querySelector('.mobile-burger');
  const overlay = document.querySelector('.mobile-overlay');
  const sheet = document.querySelector('.mobile-sheet');
  const mobileLinks = document.querySelectorAll('.mobile-nav-link, .mobile-sign-in');

  function openMenu() {
    if (!burger || !overlay || !sheet) return;
    burger.setAttribute('aria-expanded', 'true');
    overlay.classList.add('open');
    sheet.classList.add('open');
    document.body.classList.add('menu-open');
  }

  function closeMenu() {
    if (!burger || !overlay || !sheet) return;
    burger.setAttribute('aria-expanded', 'false');
    overlay.classList.remove('open');
    sheet.classList.remove('open');
    document.body.classList.remove('menu-open');
  }

  if (burger) {
    burger.addEventListener('click', () => {
      const isOpen = burger.getAttribute('aria-expanded') === 'true';
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }

  if (overlay) {
    overlay.addEventListener('click', closeMenu);
  }

  mobileLinks.forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 720) {
      closeMenu();
    }
  });

  // 2. Count-Up Logic for Stats
  const statElements = document.querySelectorAll('.stat-item');
  const statsData = [
    { target: 120, decimals: 0, suffix: 'ms' },
    { target: 99.99, decimals: 2, suffix: '%' },
    { target: 24, decimals: 0, suffix: '/7' },
    { target: 2.4, decimals: 1, suffix: 'M' },
  ];

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateStat(element, data, index) {
    const valueEl = element.querySelector('.stat-value');
    if (!valueEl) return;

    const duration = 1500 + index * 80;
    const delay = 480 + index * 90;

    setTimeout(() => {
      let startTime = null;

      function step(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = Math.min((timestamp - startTime) / duration, 1);
        const eased = easeOutCubic(progress);
        const currentVal = (data.target * eased).toFixed(data.decimals);
        valueEl.textContent = currentVal;

        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          valueEl.textContent = data.target.toFixed(data.decimals);
        }
      }

      requestAnimationFrame(step);
    }, delay);
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        statElements.forEach((statEl, idx) => {
          if (statsData[idx]) {
            animateStat(statEl, statsData[idx], idx);
          }
        });
        obs.disconnect();
      }
    });
  }, { threshold: 0.25 });

  const statsFooter = document.querySelector('.stats-footer');
  if (statsFooter) {
    observer.observe(statsFooter);
  }

  // 3. Better Auth Session Checker & Header State
  async function checkHeaderAuth() {
    const signInBtns = document.querySelectorAll('.sign-in-btn');
    const mobileSignInBtns = document.querySelectorAll('.mobile-sign-in');

    try {
      const res = await fetch('/api/auth/get-session', { credentials: 'include' });
      if (res.ok) {
        const session = await res.json();
        if (session && session.user) {
          const displayName = session.user.name || session.user.email.split('@')[0];
          signInBtns.forEach(btn => {
            btn.href = 'auth.html';
            btn.innerHTML = `<i class="fa-solid fa-circle-user" style="color: #4ade80; margin-right: 6px;"></i> <span>${displayName}</span>`;
            btn.title = `Signed in as ${session.user.email} (MongoDB Atlas)`;
          });
          mobileSignInBtns.forEach(btn => {
            btn.href = 'auth.html';
            btn.innerHTML = `<i class="fa-solid fa-circle-user" style="color: #4ade80; margin-right: 6px;"></i> <span>Account (${displayName})</span>`;
          });
          return;
        }
      }
    } catch (e) {
      // Backend not running or static view
    }

    // Default: link to auth.html if not on auth.html
    signInBtns.forEach(btn => {
      if (!btn.getAttribute('data-keep-link')) {
        btn.href = 'auth.html';
        btn.textContent = 'Sign in';
      }
    });
    mobileSignInBtns.forEach(btn => {
      if (!btn.getAttribute('data-keep-link')) {
        btn.href = 'auth.html';
        btn.textContent = 'Sign in';
      }
    });
  }

  checkHeaderAuth();
});
