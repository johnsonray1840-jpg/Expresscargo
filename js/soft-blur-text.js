/**
 * Soft Blur enter + scroll reveals for page content (animate-text: soft-blur-in).
 * Animates section blocks, grids, and marked nodes — not headings alone.
 */
(function () {
  'use strict';

  var ENTER = {
    duration: 900,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    from: { opacity: 0, y: 18, blur: 12 },
    to: { opacity: 1, y: 0, blur: 0 }
  };

  var SCROLL = {
    duration: 780,
    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
    from: { opacity: 0, y: 22, blur: 10 },
    to: { opacity: 1, y: 0, blur: 0 }
  };

  var STAGGER_MS = 70;

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function frame(state) {
    return {
      opacity: String(state.opacity),
      transform: 'translate3d(0, ' + state.y + 'px, 0)',
      filter: 'blur(' + state.blur + 'px)'
    };
  }

  function animateElement(el, config) {
    el.style.willChange = 'transform, opacity, filter';
    el.style.opacity = String(config.from.opacity);
    el.style.transform = 'translate3d(0, ' + config.from.y + 'px, 0)';
    el.style.filter = 'blur(' + config.from.blur + 'px)';

    var animation = el.animate(
      [frame(config.from), frame(config.to)],
      {
        duration: config.duration,
        easing: config.easing,
        fill: 'forwards'
      }
    );

    return animation.finished.then(function () {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.filter = 'none';
      el.style.willChange = 'auto';
      el.classList.remove('soft-reveal-pending');
    });
  }

  function prepareHero(el) {
    if (!el || el.dataset.softBlurReady) return;
    el.dataset.softBlurReady = '1';
    if (prefersReducedMotion()) return;
    animateElement(el, ENTER);
  }

  function isDecorative(el) {
    if (!el || el.nodeType !== 1) return true;
    if (el.matches('script, style, noscript, template')) return true;
    var cls = el.className || '';
    if (typeof cls !== 'string') cls = '';
    if (cls.indexOf('pointer-events-none') !== -1 && cls.indexOf('absolute') !== -1) return true;
    if (el.getAttribute('aria-hidden') === 'true' && !el.querySelector('img, svg, video')) return true;
    return false;
  }

  function hasGridClass(el) {
    return el.classList && el.classList.contains('grid');
  }

  function isHeroSection(section) {
    return !!(
      section.querySelector('[data-soft-blur="hero"]') ||
      section.querySelector('.hero-visual') ||
      section.querySelector('.hero-landscape-img')
    );
  }

  function getContentWrapper(section) {
    var children = section.children;
    var fallback = null;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (isDecorative(el) || el.matches('script, style')) continue;
      var cls = typeof el.className === 'string' ? el.className : '';
      if (/max-w-/.test(cls)) return el;
      if (!fallback) fallback = el;
    }
    return fallback;
  }

  function pushUnit(units, el, delay) {
    if (!el || el.dataset.softBlurReady || el.dataset.softBlurSkip === '1') return;
    for (var i = 0; i < units.length; i++) {
      if (units[i].el === el) return;
    }
    units.push({ el: el, delay: delay || 0 });
  }

  function collectFromWrapper(wrapper, units) {
    if (!wrapper) return;
    var kids = wrapper.children;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (isDecorative(child) || child.matches('script, style')) continue;

      if (hasGridClass(child) && child.children.length) {
        for (var g = 0; g < child.children.length; g++) {
          pushUnit(units, child.children[g], g * STAGGER_MS);
        }
      } else if (child.hasAttribute('data-soft-stagger') && child.children.length) {
        for (var s = 0; s < child.children.length; s++) {
          pushUnit(units, child.children[s], s * STAGGER_MS);
        }
      } else {
        pushUnit(units, child, Math.min(i, 4) * 40);
      }
    }
  }

  function collectFromHero(section, units) {
    // Keep hero copy/visual on their own entrance; reveal the track strip if present.
    var track = section.querySelector('.relative.z-30, [class*="z-30"]');
    if (track && section.contains(track)) {
      pushUnit(units, track, 0);
    }
  }

  function collectExplicit(units) {
    document.querySelectorAll('[data-soft-reveal]').forEach(function (el) {
      if (el.closest('[data-soft-stagger]')) return;
      pushUnit(units, el, 0);
    });

    document.querySelectorAll('[data-soft-stagger]').forEach(function (group) {
      for (var i = 0; i < group.children.length; i++) {
        pushUnit(units, group.children[i], i * STAGGER_MS);
      }
    });
  }

  function collectSections(units) {
    var roots = document.querySelectorAll('section, footer');
    roots.forEach(function (section) {
      if (section.hasAttribute('data-soft-skip')) return;
      if (isHeroSection(section)) {
        collectFromHero(section, units);
        return;
      }
      collectFromWrapper(getContentWrapper(section), units);
    });
  }

  function dedupeUnits(units) {
    return units.filter(function (unit) {
      return !units.some(function (other) {
        return other !== unit && other.el.contains(unit.el);
      });
    });
  }

  function revealUnit(unit) {
    var el = unit.el;
    if (!el || el.dataset.softBlurReady) return;
    el.dataset.softBlurReady = '1';

    var run = function () {
      animateElement(el, SCROLL);
    };

    if (unit.delay) {
      window.setTimeout(run, unit.delay);
    } else {
      run();
    }
  }

  function prepareScrollReveals() {
    var units = [];
    collectSections(units);
    collectExplicit(units);
    units = dedupeUnits(units);

    if (!units.length) return;

    if (prefersReducedMotion()) {
      units.forEach(function (unit) {
        unit.el.style.opacity = '1';
        unit.el.style.transform = 'none';
        unit.el.style.filter = 'none';
        unit.el.classList.remove('soft-reveal-pending');
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          observer.unobserve(el);
          var unit = el._softRevealUnit;
          if (unit) revealUnit(unit);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
    );

    units.forEach(function (unit) {
      unit.el._softRevealUnit = unit;
      unit.el.classList.add('soft-reveal-pending');
      unit.el.style.opacity = '0';
      observer.observe(unit.el);
    });
  }

  function boot() {
    document.querySelectorAll('[data-soft-blur="hero"]').forEach(prepareHero);
    prepareScrollReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
