/*
 * wordbyword.js — పదవిభాగం / WORD-BY-WORD. Flexible text section for the
 * per-word gloss (e.g. smruti's gita feed). The value may be a string
 * ("a | b | c"), an array, or an object of {word: meaning}; it is normalised to
 * a single " · "-joined string before the shared text renderer draws it.
 */
(function () {
  function normalize(value) {
    if (Array.isArray(value)) return value.join('  ·  ');
    if (value && typeof value === 'object') {
      return Object.keys(value).map(k => `${k} — ${value[k]}`).join('  ·  ');
    }
    return String(value).replace(/\s*[|।]\s*/g, '  ·  ');
  }

  const base = window.__makeTextSection({
    heading: ['పదవిభాగం', 'WORD-BY-WORD'],
    color: 'headNeutral',
    ink: 'ink2',
    startSize: 30,
    minSize: 14,
  });

  window.Sections.register('wordbyword', {
    flexible: true,
    startSize: base.startSize,
    minSize: base.minSize,
    measure(ctx, value, env, opts) { return base.measure.call(this, ctx, normalize(value), env, opts); },
    draw(ctx, value, env, y, opts) { return base.draw.call(this, ctx, normalize(value), env, y, opts); },
  });
})();
