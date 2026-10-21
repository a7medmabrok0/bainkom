(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Header: solid once the page scrolls, mobile menu toggle
  const header = document.querySelector('[data-header]');
  const toggle = header?.querySelector('[data-menu-toggle]');
  const onScroll = () => header?.classList.toggle('is-scrolled', scrollY > 24);
  onScroll();
  addEventListener('scroll', onScroll, { passive: true });
  toggle?.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'إغلاق القائمة' : 'فتح القائمة');
  });
  header?.querySelectorAll('[data-nav] a').forEach(link => link.addEventListener('click', () => {
    header.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
  }));

  // Scroll reveal, staggered inside each grid
  const revealed = document.querySelectorAll('[data-reveal]');
  revealed.forEach(element => {
    const siblings = [...element.parentElement.children].filter(child => child.hasAttribute('data-reveal'));
    const index = siblings.indexOf(element);
    if (index > 0) element.style.setProperty('--reveal-delay', `${Math.min(index, 5) * 80}ms`);
  });
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealed.forEach(element => element.classList.add('is-in'));
  } else {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: .12 });
    revealed.forEach(element => observer.observe(element));
  }

  // Whole card is clickable: it follows the card's own CTA link
  document.querySelectorAll('[data-card-link]').forEach(card => {
    const link = card.querySelector('.service-card__cta, .svc__cta, .package-card__foot a, .pkg__foot a, .card-drawer a');
    if (!link) return;
    card.addEventListener('click', event => {
      if (event.target.closest('a, button')) return;
      if (event.metaKey || event.ctrlKey || link.target === '_blank') window.open(link.href, '_blank', 'noopener');
      else link.click();
    });
  });

  // Run a callback once an element scrolls into view
  const whenVisible = (element, callback, threshold = .35) => {
    if (!element) return;
    if (!('IntersectionObserver' in window)) return callback();
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      callback();
    }, { threshold });
    observer.observe(element);
  };

  // Stats: count up from zero when they come into view
  const formatNumber = (value, el) => {
    const decimals = Number(el.dataset.decimals || 0);
    const fixed = value.toFixed(decimals);
    return el.dataset.format === 'comma' ? Number(fixed).toLocaleString('en-US') : fixed;
  };
  document.querySelectorAll('[data-stats]').forEach(stats => {
    const counters = stats.querySelectorAll('[data-count]');
    const run = () => {
      stats.classList.add('is-counted');
      counters.forEach(el => {
        const target = Number(el.dataset.count);
        if (reducedMotion) { el.textContent = formatNumber(target, el); return; }
        const duration = 2000, start = performance.now();
        const tick = now => {
          const t = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - t, 4);
          el.textContent = formatNumber(target * eased, el);
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    };
    // let the hero entrance finish first
    whenVisible(stats, () => setTimeout(run, reducedMotion ? 0 : 500), .5);
  });

  // Designer cards: several portfolio photos with arrows, dots and swipe
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const track = gallery.querySelector('[data-gallery-track]');
    const slides = [...track.children];
    const dots = [...gallery.querySelectorAll('[data-gallery-dots] button')];
    const prev = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    let index = 0;
    const show = i => {
      index = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: slides[index].offsetLeft, behavior: reducedMotion ? 'auto' : 'smooth' });
    };
    const sync = i => {
      index = i;
      dots.forEach((dot, d) => d === i ? dot.setAttribute('aria-current', 'true') : dot.removeAttribute('aria-current'));
      prev.disabled = i === 0;
      next.disabled = i === slides.length - 1;
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) sync(slides.indexOf(entry.target));
    }, { root: track, threshold: .6 });
    slides.forEach(slide => observer.observe(slide));
    prev.addEventListener('click', () => show(index - 1));
    next.addEventListener('click', () => show(index + 1));
    dots.forEach((dot, d) => dot.addEventListener('click', () => show(d)));
    sync(0);
  });

  // Quiz demo: the picked image moves around like someone taking the quiz
  const quizDemo = document.querySelector('[data-quiz-demo]');
  if (quizDemo && !reducedMotion) {
    const tiles = [...quizDemo.querySelectorAll('[data-quiz-tile]')];
    const match = quizDemo.querySelector('[data-quiz-match]');
    let picked = tiles.findIndex(tile => tile.classList.contains('is-picked'));
    whenVisible(quizDemo, () => setInterval(() => {
      picked = (picked + 1 + Math.floor(Math.random() * (tiles.length - 1))) % tiles.length;
      tiles.forEach((tile, i) => tile.classList.toggle('is-picked', i === picked));
      if (match) match.textContent = String(82 + Math.floor(Math.random() * 15));
    }, 2200));
  }

  // Style wheel (phones): spins like a game, cycles style names while "loading", then settles on one
  const ring = document.querySelector('[data-quiz-ring]');
  if (ring && matchMedia('(max-width: 600px)').matches) {
    const spin = ring.querySelector('.quiz-ring__spin');
    const cards = [...spin.children];
    const step = 360 / cards.length;
    const match = document.querySelector('.quiz-alt__match');
    const label = match?.querySelector('[data-match-label]');
    const styleName = match?.querySelector('[data-match-style]');
    const pct = match?.querySelector('[data-match-pct]');
    let angle = 0;
    let pick = 0;
    const front = a => ((Math.round(-a / step) % cards.length) + cards.length) % cards.length;
    const show = a => {
      spin.style.setProperty('--a', `${a}deg`);
      const i = front(a);
      cards.forEach((card, n) => card.classList.toggle('is-front', n === i));
      return i;
    };
    const settle = () => {
      match?.classList.remove('is-loading');
      match?.classList.add('is-done');
      if (label) label.textContent = 'ستايلك الأقرب:';
      if (pct) pct.textContent = `${86 + Math.floor(Math.random() * 11)}%`;
    };
    const round = () => {
      pick = (pick + 1 + Math.floor(Math.random() * (cards.length - 1))) % cards.length;
      const from = angle;
      const base = from - 720;
      const to = base - (((base + pick * step) % 360) + 360) % 360;
      const start = performance.now();
      const duration = 3400;
      match?.classList.remove('is-done');
      match?.classList.add('is-loading');
      if (label) label.textContent = 'جاري التحميل…';
      const frame = now => {
        const t = Math.min((now - start) / duration, 1);
        angle = from + (to - from) * (1 - Math.pow(1 - t, 4));
        const i = show(angle);
        if (styleName) styleName.textContent = cards[i].dataset.style;
        if (t < 1) requestAnimationFrame(frame);
        else { spinning = false; settle(); later(hold); }
      };
      spinning = true;
      requestAnimationFrame(frame);
    };
    // spins only while the card is on screen: starts as it scrolls into view, then rests between rounds
    const hold = 6500;
    let visible = false;
    let spinning = false;
    let timer = null;
    const later = delay => {
      clearTimeout(timer);
      timer = setTimeout(() => { timer = null; if (visible) round(); }, delay);
    };
    show(angle);
    if (!reducedMotion && 'IntersectionObserver' in window) {
      new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible && !spinning && timer === null) later(500);
      }, { threshold: .4 }).observe(ring.closest('.quiz-alt') || ring);
    }
  }

  // Find a designer: chip rows fade at the far end while there are more chips to scroll to (RTL scrollLeft runs negative)
  document.querySelectorAll('.picker .chips').forEach(row => {
    const update = () => row.classList.toggle('has-more', row.scrollWidth - row.clientWidth - Math.abs(row.scrollLeft) > 2);
    update();
    row.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
  });

  // Find a designer: search field types itself
  const typing = document.querySelector('[data-typing]');
  if (typing && !reducedMotion) {
    const phrases = ['مصمم داخلي في الإمارات · ستايل حديث', 'مصمم معماري · فيلا بمسبح', 'تصميم مجلس · ستايل كلاسيكي'];
    let phrase = 0;
    const type = () => {
      const text = phrases[phrase];
      let i = 0;
      typing.textContent = '';
      const step = setInterval(() => {
        typing.textContent = text.slice(0, ++i);
        if (i >= text.length) {
          clearInterval(step);
          setTimeout(() => { phrase = (phrase + 1) % phrases.length; type(); }, 2600);
        }
      }, 55);
    };
    whenVisible(typing, type);
  }

  // Floating AI assistant
  const chat = document.querySelector('[data-ai-chat]');
  if (chat) {
    const panel = chat.querySelector('#ai-chat-panel');
    const toggleBtn = chat.querySelector('[data-ai-toggle]');
    const hint = chat.querySelector('[data-ai-hint]');
    const log = chat.querySelector('[data-ai-log]');
    const form = chat.querySelector('[data-ai-form]');
    const input = form.querySelector('input');
    const setOpen = open => {
      panel.hidden = !open;
      chat.classList.toggle('is-open', open);
      toggleBtn.setAttribute('aria-expanded', String(open));
      if (open) setTimeout(() => input.focus(), 50);
    };
    toggleBtn.addEventListener('click', () => setOpen(panel.hidden));
    // the phone tab bar has its own AI button in the middle: same orb, same chat
    const tabbarAi = document.querySelector('[data-ai-open]');
    if (tabbarAi) {
      const orb = tabbarAi.querySelector('[data-ai-orb-clone]');
      if (orb) orb.innerHTML = toggleBtn.querySelector('.ai-chat__orb').innerHTML;
      tabbarAi.addEventListener('click', () => setOpen(panel.hidden));
    }
    chat.querySelector('[data-ai-close]').addEventListener('click', () => { setOpen(false); toggleBtn.focus(); });
    addEventListener('keydown', event => { if (event.key === 'Escape' && !panel.hidden) { setOpen(false); toggleBtn.focus(); } });

    // hint bubble pops up now and then while the chat is closed
    const nudge = () => {
      if (!panel.hidden) return;
      hint.classList.add('is-shown');
      setTimeout(() => hint.classList.remove('is-shown'), 4200);
    };
    setTimeout(nudge, 3500);
    setInterval(nudge, 22000);

    // phones: the tab-bar AI button "talks" and shows "start here" now and then; × hides it for good
    const tip = document.querySelector('[data-ai-tip]');
    if (tip && tabbarAi) {
      const key = 'bainkom-ai-tip-off';
      let off = false;
      try { off = localStorage.getItem(key) === '1'; } catch {}
      const hide = () => { tip.classList.remove('is-shown'); tabbarAi.classList.remove('is-talking'); };
      const show = () => {
        if (off || !panel.hidden) return;
        tip.hidden = false;
        requestAnimationFrame(() => tip.classList.add('is-shown'));
        tabbarAi.classList.add('is-talking');
        setTimeout(hide, 5200);
      };
      tip.querySelector('[data-ai-tip-open]').addEventListener('click', () => { hide(); setOpen(true); });
      tip.querySelector('[data-ai-tip-close]').addEventListener('click', () => {
        off = true;
        hide();
        try { localStorage.setItem(key, '1'); } catch {}
      });
      tabbarAi.addEventListener('click', hide);
      if (!off) {
        setTimeout(show, 4000);
        setInterval(show, 25000);
      }
    }

    // Placeholder replies until the real assistant API is connected
    const replies = [
      [/ستايل|ستايلي|اسلوب|أسلوب/, 'أسهل طريقة إنك تجرب <a href="https://www.bainkom.com/ar/interior-design-style-quiz">اختبار الستايل</a> — دقيقتين وتعرف ستايلك ونرشّح لك مصممين يناسبوه ✨'],
      [/سعر|تكلفة|كم|ميزانية|باقة/, 'باقات التصميم تبدأ من <b>300$</b> لغرفة النوم، و460$ للمجلس، و510$ للمطبخ، و600$ للحديقة. <a href="#packages">شوف الباقات</a>'],
      [/استشارة|موعد|احجز/, 'تقدر تحجز <a href="https://www.bainkom.com/ar/free-interior-design-consultation">استشارة مجانية</a> مع مصمم معتمد في دقائق 📅'],
      [/مصمم|معماري|ديكور|داخلي/, 'عندنا أكثر من 60 مصمم معتمد. <a href="https://www.bainkom.com/ar/our-designers">تصفّح المصممين</a> وفلتر حسب التخصص والدولة والستايل 🔍'],
    ];
    const answer = text => (replies.find(([pattern]) => pattern.test(text)) || [, 'سؤال حلو! فريق بينكم يقدر يساعدك أكثر — ابدأ <a href="https://www.bainkom.com/ar/free-interior-design-consultation">باستشارة مجانية</a> أو <a href="https://www.bainkom.com/ar/contact-us">تواصل معنا</a>.'])[1];
    const add = (html, who) => {
      const bubble = document.createElement('p');
      bubble.className = `bubble bubble--${who}`;
      if (who === 'me') bubble.textContent = html; else bubble.innerHTML = html;
      log.append(bubble);
      log.scrollTop = log.scrollHeight;
      return bubble;
    };
    const ask = text => {
      if (!text.trim()) return;
      add(text, 'me');
      const typingBubble = add('<i></i><i></i><i></i>', 'ai');
      typingBubble.classList.add('ai-typing');
      setTimeout(() => {
        typingBubble.classList.remove('ai-typing');
        typingBubble.innerHTML = answer(text);
        log.scrollTop = log.scrollHeight;
      }, reducedMotion ? 0 : 900);
    };
    chat.querySelectorAll('[data-ai-ask]').forEach(chip => chip.addEventListener('click', () => ask(chip.dataset.aiAsk)));
    form.addEventListener('submit', event => {
      event.preventDefault();
      ask(input.value);
      input.value = '';
    });
  }

  // Reviews: before / after toggle on each card
  document.querySelectorAll('[data-compare]').forEach(card => {
    card.dataset.state = 'after';
    card.querySelectorAll('[data-show]').forEach(button => button.addEventListener('click', () => {
      card.dataset.state = button.dataset.show;
      card.querySelectorAll('[data-show]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
    }));
  });

  // Step cards: small interactions inside the mockups
  const optionsBox = document.querySelector('[data-sp-options]');
  if (optionsBox) {
    const answer = document.querySelector('[data-sp-answer]');
    optionsBox.querySelectorAll('.sp-option').forEach(option => option.addEventListener('click', () => {
      optionsBox.querySelectorAll('.sp-option').forEach(other => other.classList.toggle('is-picked', other === option));
      answer.textContent = option.textContent;
      answer.style.animation = 'none'; answer.offsetWidth; answer.style.animation = '';
    }));
  }
  const offers = document.querySelector('[data-sp-offers]');
  if (offers) {
    const chosen = document.querySelector('[data-sp-chosen]');
    const cta = document.querySelector('[data-sp-cta]');
    const label = document.querySelector('[data-sp-cta-label]');
    offers.querySelectorAll('.sp-offer').forEach(offer => offer.addEventListener('click', () => {
      offers.querySelectorAll('.sp-offer').forEach(other => other.classList.toggle('is-picked', other === offer));
      if (chosen) chosen.textContent = offer.querySelector('.sp-offer__avatar').alt;
      if (cta && offer.dataset.href) cta.href = offer.dataset.href;
      if (label && offer.dataset.cta) label.textContent = offer.dataset.cta;
    }));
  }
  // Project card: tabs switch by themselves every few seconds while the card is on screen
  const tabs = document.querySelector('[data-sp-tabs]');
  if (tabs) {
    const buttons = [...tabs.querySelectorAll('[data-sp-tab]')];
    const panel = tabs.closest('[data-step-panel]');
    const interval = 3600;
    let index = 0, timer, resumeAt = 0;
    tabs.style.setProperty('--tab-time', `${interval}ms`);
    const show = i => {
      index = i;
      tabs.dataset.active = String(i);
      buttons.forEach((b, n) => b.classList.toggle('is-active', n === i));
      document.querySelectorAll('[data-sp-pane]').forEach(pane => pane.classList.toggle('is-active', pane.dataset.spPane === buttons[i].dataset.spTab));
      if (buttons[i].dataset.spTab === 'pay') buttons[i].querySelector('.sp-badge')?.remove();
    };
    const tick = () => {
      const running = !reducedMotion && panel.classList.contains('is-active') && Date.now() > resumeAt;
      tabs.classList.toggle('is-auto', running);
      if (running) show((index + 1) % buttons.length);
    };
    buttons.forEach((b, i) => b.addEventListener('click', () => {
      show(i);
      resumeAt = Date.now() + 8000; // pause auto-switching for a while after a manual pick
      tabs.classList.remove('is-auto');
    }));
    // restart from "chat" whenever the step becomes active
    new MutationObserver(() => {
      if (panel.classList.contains('is-active')) { show(0); tabs.classList.toggle('is-auto', !reducedMotion); }
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    timer = setInterval(tick, interval);
    show(0);
  }
  // Find a designer: one pick per group fills the summary card and builds the designers link
  const picker = document.querySelector('[data-picker]');
  if (picker) {
    const link = picker.querySelector('[data-pick-link]');
    const value = key => picker.querySelector(`[data-pick="${key}"] [aria-pressed="true"]`)?.dataset.value;
    const update = () => {
      link.href = `https://www.bainkom.com/ar/our-designers/${value('country') || 'all'}/${value('profession') || 'professions'}/${value('style') || 'styles'}`;
    };
    picker.querySelectorAll('.pick-chip').forEach(chip => chip.addEventListener('click', () => {
      const group = chip.closest('[data-pick]');
      group.querySelectorAll('.pick-chip').forEach(other => other.setAttribute('aria-pressed', String(other === chip)));
      const out = picker.querySelector(`[data-pick-out="${group.dataset.pick}"]`);
      out.textContent = chip.textContent;
      out.classList.remove('is-changed'); out.offsetWidth; out.classList.add('is-changed');
      update();
    }));
    update();
  }
  // Bottom edge blur: fade it out once the footer comes into view
  const edgeBlur = document.querySelector('.edge-blur');
  const footer = document.querySelector('.site-footer');
  if (edgeBlur && footer && 'IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => edgeBlur.classList.toggle('is-hidden', entry.isIntersecting)).observe(footer);
  }
  // "+N" chips reveal the rest of a list
  document.querySelectorAll('[data-chip-more]').forEach(button => button.addEventListener('click', () => {
    const list = button.closest('ul');
    list.querySelectorAll('.is-extra').forEach(li => { li.hidden = false; });
    button.closest('li').remove();
  }));

  // Carousels (designers, reviews): arrows scroll one card; RTL "next" scrolls toward the left
  document.querySelectorAll('[data-carousel-section]').forEach(section => {
    const track = section.querySelector('[data-carousel]');
    const prev = section.querySelector('[data-carousel-prev]');
    const next = section.querySelector('[data-carousel-next]');
    if (!track || !prev || !next) return;
    const rtl = getComputedStyle(track).direction === 'rtl';
    const stepSize = () => (track.firstElementChild?.offsetWidth || 300) + 16;
    const update = () => {
      const max = track.scrollWidth - track.clientWidth;
      const position = Math.abs(track.scrollLeft);
      prev.disabled = position < 4;
      next.disabled = position > max - 4;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: (rtl ? 1 : -1) * stepSize(), behavior: reducedMotion ? 'auto' : 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: (rtl ? -1 : 1) * stepSize(), behavior: reducedMotion ? 'auto' : 'smooth' }));
    track.addEventListener('scroll', update, { passive: true });
    addEventListener('resize', update);
    update();
  });

  // Steps: the section stays pinned while you scroll, and each step takes a share of the scroll
  const stepsScroll = document.querySelector('[data-steps-scroll]');
  const steps = document.querySelector('[data-steps]');
  if (steps && stepsScroll) {
    const buttons = [...steps.querySelectorAll('[data-step]')];
    const images = [...steps.querySelectorAll('[data-step-panel]')];
    const dots = [...stepsScroll.querySelectorAll('.steps-scroll__dots i')];
    let current = -1, ticking = false;

    const select = index => {
      if (index === current) return;
      current = index;
      buttons.forEach((button, i) => {
        button.classList.toggle('is-active', i === index);
        button.setAttribute('aria-selected', String(i === index));
      });
      images.forEach((image, i) => image.classList.toggle('is-active', i === index));
      dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    };
    const range = () => {
      const top = stepsScroll.getBoundingClientRect().top + scrollY;
      return { top, length: Math.max(1, stepsScroll.offsetHeight - innerHeight) };
    };
    const update = () => {
      ticking = false;
      const { top, length } = range();
      const progress = Math.min(1, Math.max(0, (scrollY - top) / length));
      const position = progress * buttons.length;
      const index = Math.min(buttons.length - 1, Math.floor(position));
      select(index);
      buttons[index].style.setProperty('--step-progress', String(Math.min(1, position - index)));
    };
    addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    addEventListener('resize', update);
    // clicking a step scrolls to its share of the pinned section
    buttons.forEach((button, i) => button.addEventListener('click', () => {
      const { top, length } = range();
      scrollTo({ top: top + length * (i + .15) / buttons.length, behavior: reducedMotion ? 'auto' : 'smooth' });
    }));
    update();
  }
})();
