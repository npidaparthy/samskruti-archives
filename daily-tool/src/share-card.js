// Share card generator — palm leaf manuscript design
// Draws a 1080×1080 PNG on an off-screen canvas and shares or downloads it.
// data = { slug, script, syllables, source, verse, meaning, tatparyam }

window.ShareCard = (() => {
  const S     = 1080;
  const OUTER = 36;
  const INNER = 52;
  const CONT  = 90;
  const INK   = '#1A0A02';
  const INK2  = '#3A2010';

  const VERSE_FAM = '"Noto Sans Telugu","Noto Serif Devanagari","Georgia",serif';
  const BODY_FAM  = '"Noto Sans Telugu","Georgia",serif';
  const SRC_FAM   = '"Georgia",serif';

  function _noise(ctx, w, h, alpha) {
    const id = ctx.createImageData(w, h);
    const d  = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.random() * 255;
      d[i] = d[i+1] = d[i+2] = v; d[i+3] = alpha;
    }
    ctx.putImageData(id, 0, 0);
  }

  function _sectionHeading(ctx, label, x, y, color) {
    ctx.save();
    ctx.font = 'bold 28px "Georgia",serif';
    ctx.fillStyle = color; ctx.textAlign = 'left';
    const tw = ctx.measureText(label).width;
    const lx = x - tw / 2;
    ctx.fillText(label, lx, y);
    const gap = 16, len = 72;
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.45;
    ctx.beginPath(); ctx.moveTo(lx - gap - len, y - 8); ctx.lineTo(lx - gap, y - 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx + tw + gap, y - 8); ctx.lineTo(lx + tw + gap + len, y - 8); ctx.stroke();
    ctx.restore();
  }

  // Wrap text with no truncation; returns bottom Y after last line
  function _wrap(ctx, text, x, y, maxW, lineH) {
    const words = text.split(' ');
    let line = '', cy = y;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line.trim(), x, cy); line = word + ' '; cy += lineH;
      } else { line = test; }
    }
    if (line.trim()) ctx.fillText(line.trim(), x, cy);
    return cy + lineH;
  }

  // Measure wrapped height without drawing
  function _measureWrap(ctx, text, maxW, lineH) {
    const words = text.split(' ');
    let line = '', lines = 1;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxW && line) { line = word + ' '; lines++; }
      else { line = test; }
    }
    return lines * lineH;
  }

  // Verse line format:
  //   Anuṣṭup (≤8 syl) → always 2 lines (join pada pairs)
  //   Longer metres     → always 4 lines (split at | / । if stored as 2)
  function _prepareVerse(text, syllables) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if ((syllables || 8) <= 8) {
      if (lines.length === 4) return [`${lines[0]} ${lines[1]}`, `${lines[2]} ${lines[3]}`];
      return lines; // already 2 lines
    }
    // Longer metre — ensure 4 lines
    if (lines.length === 2) {
      // Split each of the 2 lines at the pada separator | or ।
      const four = lines.flatMap(l => {
        const parts = l.split(/\s*[|।]\s*/);
        return parts.length >= 2
          ? [parts[0].trim(), parts.slice(1).join(' ').trim()]
          : [l];
      }).filter(Boolean);
      if (four.length === 4) return four;
    }
    return lines; // already 4 lines or unusual structure
  }

  function _draw(canvas, data) {
    const ctx   = canvas.getContext('2d');
    const textW = S - CONT * 2;

    // ── Background ──
    const bg = ctx.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0,   '#C8943A');
    bg.addColorStop(0.3, '#D4A040');
    bg.addColorStop(0.6, '#C08030');
    bg.addColorStop(1,   '#A86820');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, S, S);

    // Vein streaks (deterministic — consistent across redraws)
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * S + 20;
      const a = 0.03 + (i % 3) * 0.015;
      ctx.strokeStyle = `rgba(${i % 2 === 0 ? '255,200,100' : '80,30,0'},${a})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(S*0.3, y+(i%2===0?8:-8), S*0.7, y+(i%2===0?-6:6), S, y);
      ctx.stroke();
    }

    // Grain
    const off = document.createElement('canvas');
    off.width = S; off.height = S;
    _noise(off.getContext('2d'), S, S, 28);
    ctx.drawImage(off, 0, 0);

    // Vignette
    const vig = ctx.createRadialGradient(S/2, S/2, S*0.32, S/2, S/2, S*0.72);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(30,8,0,0.44)');
    ctx.fillStyle = vig; ctx.fillRect(0, 0, S, S);

    // ── Decorative frame ──
    ctx.strokeStyle = 'rgba(80,30,5,0.55)'; ctx.lineWidth = 2;
    ctx.strokeRect(OUTER, OUTER, S-OUTER*2, S-OUTER*2);
    ctx.strokeStyle = 'rgba(80,30,5,0.28)'; ctx.lineWidth = 1;
    ctx.strokeRect(INNER, INNER, S-INNER*2, S-INNER*2);
    const CF = 18;
    for (const [cx,cy] of [[OUTER,OUTER],[S-OUTER,OUTER],[OUTER,S-OUTER],[S-OUTER,S-OUTER]]) {
      const sx = cx === OUTER ? 1 : -1, sy = cy === OUTER ? 1 : -1;
      ctx.strokeStyle = 'rgba(80,30,5,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx,cy+sy*CF); ctx.lineTo(cx,cy); ctx.lineTo(cx+sx*CF,cy); ctx.stroke();
    }

    // Binding hole
    ctx.save();
    ctx.beginPath(); ctx.arc(S/2, OUTER+26, 16, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(20,6,0,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(100,50,10,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();

    // ── Source band — source name + metre on separate lines, color-coded ──
    // data.source = "Book name · Metre" — split at the · separator
    const rawSrc   = data.source || '';
    const dotIdx   = rawSrc.lastIndexOf('·');
    const srcName  = (dotIdx > 0 ? rawSrc.slice(0, dotIdx) : rawSrc).trim().toUpperCase();
    const srcMetre = (dotIdx > 0 ? rawSrc.slice(dotIdx + 1) : '').trim().toUpperCase();

    const SRC_SIZE = 19, SRC_LH = SRC_SIZE * 1.55;
    const MTR_SIZE = 20, MTR_LH = MTR_SIZE * 1.4;

    // Measure source name lines
    ctx.font = `500 ${SRC_SIZE}px ${SRC_FAM}`;
    const srcWords = srcName.split(' ');
    let srcLine = '', srcLines = [];
    for (const w of srcWords) {
      const t = srcLine + w + ' ';
      if (ctx.measureText(t).width > textW && srcLine) { srcLines.push(srcLine.trim()); srcLine = w + ' '; }
      else { srcLine = t; }
    }
    if (srcLine.trim()) srcLines.push(srcLine.trim());
    srcLines = srcLines.slice(0, 2);

    // Start below binding hole (hole bottom ≈ OUTER+42); add breathing room
    const srcRule1 = OUTER + 56;
    const srcTextY = srcRule1 + 14 + SRC_SIZE;
    // Last baseline in the band: source lines, then optional metre line
    const lastSrcY = srcTextY + (srcLines.length - 1) * SRC_LH;
    const metreY   = srcMetre ? srcTextY + srcLines.length * SRC_LH + MTR_LH * 0.6 : 0;
    const srcRule2 = (srcMetre ? metreY : lastSrcY) + 18;

    ctx.strokeStyle = 'rgba(80,30,5,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(INNER, srcRule1); ctx.lineTo(S-INNER, srcRule1); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(INNER, srcRule2); ctx.lineTo(S-INNER, srcRule2); ctx.stroke();

    // Source name — warm brown
    ctx.font = `500 ${SRC_SIZE}px ${SRC_FAM}`;
    ctx.fillStyle = INK2; ctx.textAlign = 'center';
    srcLines.forEach((l, i) => ctx.fillText(l, S/2, srcTextY + i * SRC_LH));

    // Metre — accent gold with dot separators
    if (srcMetre) {
      ctx.font = `700 ${MTR_SIZE}px ${SRC_FAM}`;
      ctx.fillStyle = '#8B4500';
      ctx.fillText(`◆  ${srcMetre}  ◆`, S/2, metreY);
    }

    // ── Verse — auto-shrink to fit width, no truncation ──
    // Starting size scales down with syllable count (longer metres = smaller font)
    const verseLines = _prepareVerse(data.verse || '', data.syllables);
    const isFour     = verseLines.length >= 4;
    const syl        = data.syllables || 8;
    const isIAST     = data.script === 'iast';
    const VFS_START  = isFour
      ? (syl <= 11 ? (isIAST ? 36 : 40) : syl <= 15 ? (isIAST ? 32 : 36) : (isIAST ? 28 : 32))
      : (syl <= 8  ? (isIAST ? 38 : 42) : (isIAST ? 34 : 38));
    const VLH_MULT   = isFour ? 1.65 : 1.9;

    let VFS = VFS_START;
    while (VFS > 20) {
      ctx.font = `500 ${VFS}px ${VERSE_FAM}`;
      if (Math.max(...verseLines.map(l => ctx.measureText(l).width)) <= textW) break;
      VFS--;
    }
    ctx.font = `500 ${VFS}px ${VERSE_FAM}`;
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    // First baseline must clear the rule by the glyph height
    const verseStartY = srcRule2 + 28 + VFS;
    let vy = verseStartY;
    for (const line of verseLines) { ctx.fillText(line, S/2, vy); vy += VFS * VLH_MULT; }
    const verseEndY = vy - VFS * (VLH_MULT - 0.3);

    // ── Find font sizes so meaning + commentary fit without truncation ──
    const footerRule = S - INNER - 58;
    const SECT_GAP   = 44, HEAD_H = 42;
    const available  = footerRule - 20 - verseEndY - SECT_GAP - HEAD_H - SECT_GAP - HEAD_H;

    let mSize = 38, tSize = 32;
    while (mSize >= 16) {
      ctx.font = `500 ${mSize}px ${BODY_FAM}`;
      const mH = _measureWrap(ctx, data.meaning || '', textW, mSize * 1.6);
      ctx.font = `500 ${tSize}px ${BODY_FAM}`;
      const tH = _measureWrap(ctx, data.tatparyam || '', textW, tSize * 1.6);
      if (mH + tH <= available) break;
      mSize--; tSize = Math.max(14, mSize - 4);
    }

    // ── Meaning ──
    const meaningHeadY = verseEndY + SECT_GAP;
    const meaningTextY = meaningHeadY + HEAD_H;
    _sectionHeading(ctx, 'అర్థం  ·  MEANING', S/2, meaningHeadY, '#6B1A00');
    ctx.font = `500 ${mSize}px ${BODY_FAM}`;
    ctx.fillStyle = INK; ctx.textAlign = 'center';
    const meaningEndY = _wrap(ctx, data.meaning || '', S/2, meaningTextY, textW, mSize * 1.6);

    // ── Commentary ──
    const tatpHeadY = meaningEndY + SECT_GAP - 8;
    const tatpTextY = tatpHeadY + HEAD_H;
    _sectionHeading(ctx, 'తాత్పర్యం  ·  COMMENTARY', S/2, tatpHeadY, '#1A3A20');
    ctx.font = `500 ${tSize}px ${BODY_FAM}`;
    ctx.fillStyle = INK2; ctx.textAlign = 'center';
    _wrap(ctx, data.tatparyam || '', S/2, tatpTextY, textW, tSize * 1.6);

    // ── Footer ──
    const footerY = S - INNER - 18;
    ctx.strokeStyle = 'rgba(80,30,5,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(INNER, footerRule); ctx.lineTo(S-INNER, footerRule); ctx.stroke();
    ctx.font = '600 26px "Noto Sans Telugu","Noto Serif Devanagari","Georgia",serif';
    ctx.fillStyle = INK; ctx.textAlign = 'left';
    ctx.fillText('సంస్కృతి · संस्कृति', CONT, footerY);
    ctx.font = '500 24px "Georgia",serif';
    ctx.fillStyle = INK2; ctx.textAlign = 'right';
    ctx.fillText('https://samskruti.info', S - CONT, footerY);
  }

  async function share(data) {
    const canvas = document.createElement('canvas');
    canvas.width = S; canvas.height = S;
    _draw(canvas, data);

    const filename = `subhashitam-${data.slug || 'verse'}.png`;

    if (navigator.share && navigator.canShare) {
      try {
        const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'సుభాషితం', text: 'samskruti.info' });
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }

    // Desktop fallback — download
    const a = document.createElement('a');
    a.download = filename;
    a.href = canvas.toDataURL('image/png');
    a.click();
  }

  return { share };
})();
