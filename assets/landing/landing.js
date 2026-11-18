/*
 * Landing page motion (lucid template, adapted):
 *   M0 loading: the night and day pictures are rendered in code (scene.js + art.js) while the counter runs
 *   M1 preloader: the night picture behind misted glass; one click wipes a spiral clear around the spot clicked
 *   M2 intro: the clear patch grows over the screen, the page blurs in, the picture turns from night to day
 *   M3 nav theme, M4 section 2 reveal, M5 picture-to-white tiles, all on scroll
 * Needs GSAP (window.gsap), window.LucidScene and window.LANDING_ART; the glass tab bar (.ftb) is revealed with the nav.
 */
(function () {
  "use strict";

  /* ─── Motion constants ─── */
  // the wipe: the spiral the clear patch follows (in a 1920 × 1080 comp), its brush, its speed
  const PATH =
    "M919.486 547.507C899.916 481.274 1030.31 451.248 1074.72 498.165C1090.28 514.612 1103.31 591.523 1019.5 625.5" +
    "C927 663 762.922 637.74 788.275 514.612C804.037 438.067 910.59 386.617 961.741 377.257" +
    "C1088.06 354.142 1125.09 413.127 1153 440.379C1230.39 515.943 1236.2 660.976 992.431 730.647" +
    "C831.999 776.5 631.999 620.5 754 448.5";
  const CENTER = { x: 958, y: 555 }; // the middle of the spiral; it is moved to where the visitor clicks
  const SPIRAL = { left: 205, right: 290, up: 215, down: 235 }; // how far the wiped patch reaches from CENTER
  const RES = 0.5; // fog canvas resolution
  const BRUSH = 300;
  const SWEEP = 1.2; // seconds for a full wipe
  const RAMP = 0.35; // seconds for the wipe to reach full speed
  const FOG_BLUR = 17.3;
  const GRAIN_BLUR = 4.2;
  const RING_LENGTH = 2 * Math.PI * 85.29;
  const RING_FILL = 87;
  const TILE = { desktop: 180, mobile: 104 };
  const FALLBACK_PICTURE = "assets/hero/hero-2.jpg"; // shown when the pictures can't be rendered here

  const gsap = window.gsap;
  const html = document.documentElement;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smoothstep = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  const scene = $("#scene");
  const nightImg = $("#pic-night");
  const dayImg = $("#pic-day");
  const glow = $("#glow");
  const tilesEl = $("#tiles");
  const probe = $("#probe");
  const nav = $("#nav");
  const h1 = $("#hero-title");
  const h2 = $("#clarity-title");
  const clarity = $("#clarity");
  const ring = $("#ring-arc");
  const pre = $("#pre");
  const ftb = () => $(".ftb");

  if (!gsap) {
    // without the animation library: show everything as it is
    html.classList.remove("is-loading");
    $$("[data-reveal]").forEach((el) => (el.style.opacity = "1"));
    return;
  }

  // start at the top, no scrolling until the intro is done
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.scrollTo(0, 0);

  /* ─── The headlines: one span per character ─── */
  const splitChars = (el) => {
    Array.from(el.childNodes).forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        Array.from(n.textContent).forEach((ch) => {
          const s = document.createElement("span");
          s.setAttribute("data-char", "");
          s.style.cssText = "display:inline-block;white-space:pre";
          s.textContent = ch;
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) splitChars(n);
    });
  };
  $$("[data-line]").forEach(splitChars);

  const setRing = (v) => {
    ring.style.strokeDasharray = `${(RING_LENGTH * v) / 100} ${RING_LENGTH}`;
  };
  setRing(reduce ? RING_FILL : 0);

  /* ─── M5 · the tiles ─── */
  function order(n) {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const ranks = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [ranks[i], ranks[j]] = [ranks[j], ranks[i]];
    }
    return ranks;
  }
  let tiles = [];
  let rank = [];
  const unit = () => probe.getBoundingClientRect().width / 100;
  const buildTiles = () => {
    const W = scene.clientWidth, H = scene.clientHeight;
    const size = (window.innerWidth >= 1024 ? TILE.desktop : TILE.mobile) * unit();
    const cols = Math.ceil(W / size), rows = Math.ceil(H / size);
    const frag = document.createDocumentFragment();
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const el = document.createElement("div");
        const left = Math.round(c * size), top = Math.round(r * size);
        el.style.cssText = `left:${left}px;top:${top}px;width:${Math.round((c + 1) * size) - left}px;height:${Math.round((r + 1) * size) - top}px`;
        tiles.push(el);
        frag.appendChild(el);
      }
    }
    tilesEl.replaceChildren(frag);
    rank = order(tiles.length);
  };

  /* ─── M3, M4, M5 · on scroll ─── */
  let introDone = false;
  let section2Shown = false;
  const update = () => {
    const H = window.innerHeight;
    const top = clarity.getBoundingClientRect().top;
    const q = clamp(1 - top / H, 0, 1);
    const n = tiles.length;
    for (let i = 0; i < n; i++) {
      const start = 0.2 + (0.55 * rank[i]) / Math.max(1, n - 1);
      const o = String(clamp((q - start) / 0.15, 0, 1));
      if (tiles[i].style.opacity !== o) tiles[i].style.opacity = o;
    }
    nav.dataset.theme = top <= H * 0.1 ? "light" : "dark";
    if (introDone && !section2Shown && top <= H * 0.1) revealSection2();
  };
  let queued = 0;
  const onScroll = () => {
    if (queued) return;
    queued = requestAnimationFrame(() => {
      queued = 0;
      update();
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", () => {
    buildTiles();
    onScroll();
  });
  buildTiles();
  update();

  /* ─── M4 · section 2 ─── */
  const io = [];
  function revealSection2() {
    section2Shown = true;
    const cards = $$('[data-reveal="clarity-card"]');
    if (reduce) {
      gsap.to($$('[data-reveal^="clarity"]'), { opacity: 1, duration: 0.4, ease: "power1.out" });
      return;
    }
    const tl = gsap.timeline();
    tl.set(h2, { opacity: 1 }, 0);
    $$("[data-line]", h2).forEach((line) => {
      tl.fromTo(
        $$("[data-char]", line),
        { opacity: 0, filter: "blur(18px)", xPercent: -30 },
        { opacity: 1, filter: "blur(0px)", xPercent: 0, duration: 0.8, ease: "power2.out", stagger: 0.035, clearProps: "filter,transform" },
        0,
      );
    });
    tl.fromTo(
      '[data-reveal="clarity-text"]',
      { opacity: 0, filter: "blur(10px)" },
      { opacity: 1, filter: "blur(0px)", duration: 0.6, ease: "power2.out", clearProps: "filter" },
      0.45,
    );
    const rise = (el, at) =>
      tl.fromTo(el, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, at);
    let slot = 0;
    cards.forEach((card) => {
      if (card.getBoundingClientRect().top < window.innerHeight) {
        rise(card, 0.6 + 0.2 * slot++);
      } else {
        // still below the fold (on phones): rise when it scrolls in
        const obs = new IntersectionObserver((entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            obs.disconnect();
            gsap.fromTo(card, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" });
          }
        });
        obs.observe(card);
        io.push(obs);
      }
    });
  }

  /* ─── M0 · loading ─── */
  const state = { loaded: 0, ready: false, shown: 0, expand: 1 };
  const counterPct = $(".pre__pct");
  const showCount = () => {
    if (!counterPct) return;
    const pct = state.ready ? 100 : Math.min(99, Math.round(state.loaded * 100));
    counterPct.textContent = String(pct).padStart(2, "0") + "%";
  };

  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('400 1em "Geist"'),
        document.fonts.load('500 1em "Geist"'),
        document.fonts.load('italic 400 1em "Instrument Serif"'),
      ]).catch(() => undefined)
    : Promise.resolve();

  let failed = false;
  function fail(error) {
    if (failed) return;
    failed = true;
    console.error("Landing: the pictures could not be rendered here, showing a photo instead.", error);
    nightImg.removeAttribute("src");
    dayImg.src = FALLBACK_PICTURE;
    const done = () => revealStatic();
    if (dayImg.decode) dayImg.decode().then(done, done);
    else done();
  }

  if (reduce && pre) pre.remove();

  let pair = null;
  try {
    pair = window.LucidScene.bakePair(window.LANDING_ART, (p) => {
      state.loaded = Math.max(state.loaded, p);
      showCount();
    });
  } catch (error) {
    fail(error);
  }

  if (pair) {
    const nightIn = pair.night.then((blob) => {
      nightImg.src = URL.createObjectURL(blob);
      return createImageBitmap(blob);
    });
    const dayIn = pair.day.then((blob) => {
      dayImg.src = URL.createObjectURL(blob);
      return dayImg.decode ? dayImg.decode() : undefined;
    });
    Promise.all([dayIn, fonts]).then(() => {
      if (failed) return;
      state.ready = true;
      showCount();
      if (reduce) revealStatic();
    }, fail);
    if (!reduce) nightIn.then((bitmap) => !failed && startPreloader(bitmap), fail);
  }

  /* ─── Reduced motion, or the fallback: everything fades in at once ─── */
  function revealStatic() {
    if (pre && pre.isConnected) pre.remove();
    scene.classList.add("is-in");
    scene.style.setProperty("--sun", "1");
    setRing(RING_FILL);
    html.classList.remove("is-loading");
    introDone = true;
    gsap.to($$("[data-reveal]").filter((el) => !el.dataset.reveal.startsWith("clarity")), {
      opacity: 1,
      duration: 0.4,
      ease: "power1.out",
    });
    if (ftb()) gsap.to(ftb(), { autoAlpha: 1, duration: 0.4, ease: "power1.out" });
    update();
  }

  /* ─── M1 · the preloader ─── */
  function startPreloader(bitmap) {
    const wrap = $(".pre__scene", pre);
    const canvas = $(".pre__fog", pre);
    const ctx = canvas.getContext("2d");
    const dot = $(".pre__dot", pre);
    const prompt = $(".pre__prompt", pre);
    const counter = $(".pre__counter", pre);
    const pathEl = $("#pre-path");
    const length = pathEl.getTotalLength();
    const path2d = new Path2D(PATH);
    const hasFilter = "filter" in CanvasRenderingContext2D.prototype;

    if (coarse) $(".pre__prompt-text", pre).textContent = "Tap anywhere to clear the sky";

    // the comp (1920 × 1080) fitted to the window like object-fit: cover
    const f = { s: 1, ox: 0, oy: 0, W: 0, H: 0 };
    let base = null;
    const fit = () => {
      f.W = window.innerWidth;
      f.H = window.innerHeight;
      f.s = Math.max(f.W / 1920, f.H / 1080);
      f.ox = (f.W - 1920 * f.s) / 2;
      f.oy = (f.H - 1080 * f.s) / 2;
      canvas.width = Math.round(f.W * RES);
      canvas.height = Math.round(f.H * RES);
      base = canvas.width && canvas.height ? fogBase(canvas.width, canvas.height) : null;
    };

    // the misted glass: the night picture, blurred, tinted and with a faint even haze of grain
    function fogBase(cw, ch) {
      const c = document.createElement("canvas");
      c.width = cw;
      c.height = ch;
      const g = c.getContext("2d");
      const br = FOG_BLUR * f.s * RES;
      const bw = cw + 6 * br, bh = ch + 6 * br;
      const sc = Math.max(bw / bitmap.width, bh / bitmap.height);
      const dw = bitmap.width * sc, dh = bitmap.height * sc;
      const dx = (cw - dw) / 2, dy = (ch - dh) / 2;
      if (hasFilter) {
        g.filter = `blur(${br}px)`;
        g.drawImage(bitmap, dx, dy, dw, dh);
        g.filter = "none";
      } else {
        const small = document.createElement("canvas");
        small.width = Math.max(1, Math.round(cw / 12));
        small.height = Math.max(1, Math.round(ch / 12));
        small.getContext("2d").drawImage(bitmap, dx / 12, dy / 12, dw / 12, dh / 12);
        g.imageSmoothingEnabled = true;
        g.drawImage(small, 0, 0, cw, ch);
      }
      g.fillStyle = "rgba(217, 217, 217, 0.15)";
      g.fillRect(0, 0, cw, ch);
      const grain = document.createElement("canvas");
      grain.width = cw;
      grain.height = ch;
      const gg = grain.getContext("2d");
      const img = gg.createImageData(cw, ch);
      const d = img.data;
      for (let i = 0; i < cw * ch; i++) {
        if (Math.random() < 0.5) {
          d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
          d[i * 4 + 3] = 26;
        }
      }
      gg.putImageData(img, 0, 0);
      if (hasFilter) g.filter = `blur(${GRAIN_BLUR * f.s * RES}px)`;
      g.drawImage(grain, 0, 0);
      g.filter = "none";
      return c;
    }

    // where the visitor clicked, in comp px, kept where the whole spiral fits on screen
    const click = { x: CENTER.x, y: CENTER.y };
    let clicked = false, clickT = 0, expandTo = 7;
    const place = (sx, sy) => {
      const left = -f.ox / f.s, right = (f.W - f.ox) / f.s, top = -f.oy / f.s, bottom = (f.H - f.oy) / f.s;
      const keep = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : clamp(v, lo, hi));
      click.x = keep((sx - f.ox) / f.s, left + SPIRAL.left, right - SPIRAL.right);
      click.y = keep((sy - f.oy) / f.s, top + SPIRAL.up, bottom - SPIRAL.down);
      // grow far enough to clear the farthest corner of the screen
      const far = Math.max(
        Math.hypot(click.x - left, click.y - top),
        Math.hypot(click.x - right, click.y - top),
        Math.hypot(click.x - left, click.y - bottom),
        Math.hypot(click.x - right, click.y - bottom),
      );
      expandTo = Math.max(7, far / 180);
    };
    const trigger = (sx, sy) => {
      if (clicked) return;
      clicked = true;
      clickT = performance.now();
      pre.classList.remove("is-armed");
      place(sx, sy);
      gsap.to(prompt, { opacity: 0, duration: 0.3, ease: "power1.out" });
      gsap.to(dot, { opacity: 1, duration: 0.25, ease: "power1.out" });
      removeEventListener("keydown", onKey);
    };
    const onPointer = (e) => trigger(e.clientX, e.clientY);
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger(window.innerWidth / 2, window.innerHeight / 2);
      }
    };
    pre.addEventListener("pointerdown", onPointer);
    addEventListener("keydown", onKey);

    const onResize = () => {
      fit();
      if (clicked) place(f.ox + f.s * click.x, f.oy + f.s * click.y);
    };
    addEventListener("resize", onResize);
    fit();

    // start: the misted night fades in with the scene, then the prompt
    scene.classList.add("is-in");
    gsap.to(wrap, { opacity: 1, duration: 0.6, ease: "power1.out" });
    gsap.to(prompt, { opacity: 1, duration: 0.6, delay: 0.5, ease: "power1.out" });
    pre.classList.add("is-armed");

    let raf = 0, last = performance.now(), wiped = false;
    const frame = (now) => {
      if (!pathEl.isConnected) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;

      if (clicked) {
        const speed = Math.min(1, (now - clickT) / 1000 / RAMP) / SWEEP;
        const cap = state.ready ? 1 : state.loaded * 0.9;
        state.shown = Math.max(state.shown, Math.min(cap, state.shown + speed * dt));
      }
      showCount();

      if (canvas.width && canvas.height && base) {
        const drawn = state.shown * length;
        const off = { x: click.x - CENTER.x, y: click.y - CENTER.y };
        const e = state.expand;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
        if (drawn > 0.5) {
          const k = f.s * e * RES;
          ctx.setTransform(
            k, 0, 0, k,
            (f.ox + f.s * click.x * (1 - e)) * RES + k * off.x,
            (f.oy + f.s * click.y * (1 - e)) * RES + k * off.y,
          );
          ctx.globalCompositeOperation = "destination-out";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineWidth = BRUSH * (0.35 + 0.65 * smoothstep(state.shown / 0.2)); // starts narrow, widens over the first 20%
          ctx.setLineDash([drawn, length + 1]); // only the part wiped so far
          ctx.shadowColor = "#000";
          ctx.shadowBlur = GRAIN_BLUR * 2 * k; // a soft edge
          ctx.stroke(path2d);
          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
        }
        // the point of light rides the head of the wipe
        const p = pathEl.getPointAtLength(Math.max(0, drawn));
        dot.style.transform = `translate(${f.ox + f.s * (p.x + off.x)}px, ${f.oy + f.s * (p.y + off.y)}px)`;
      }

      if (clicked && state.ready && state.shown >= 1 && !wiped) {
        wiped = true;
        intro();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const finish = () => {
      cancelAnimationFrame(raf);
      pre.removeEventListener("pointerdown", onPointer);
      removeEventListener("keydown", onKey);
      removeEventListener("resize", onResize);
      pre.remove();
      html.classList.remove("is-loading");
      introDone = true;
      update();
    };

    /* ─── M2 · the intro (t = 0 when the wipe is complete) ─── */
    function intro() {
      const tl = gsap.timeline();
      const blurIn = (targets, at, blur, duration) =>
        tl.fromTo(
          targets,
          { opacity: 0, filter: `blur(${blur}px)` },
          { opacity: 1, filter: "blur(0px)", duration, ease: "power2.out", clearProps: "filter" },
          at,
        );
      tl.to(dot, { opacity: 0, duration: 0.4, ease: "power2.in" }, 0);
      tl.to(counter, { opacity: 0, duration: 0.35, ease: "power1.in" }, 0.1);
      blurIn(nav, 0.2, 8, 0.5);
      if (ftb()) {
        tl.fromTo(
          ftb(),
          { autoAlpha: 0, filter: "blur(8px)" },
          { autoAlpha: 1, filter: "blur(0px)", duration: 0.5, ease: "power2.out", clearProps: "filter" },
          0.2,
        );
      }
      tl.to(state, { expand: expandTo, duration: 0.7, ease: "power2.in", onComplete: finish }, 0.3);
      tl.set(h1, { opacity: 1 }, 0.75);
      $$("[data-line]", h1).forEach((line) => {
        tl.fromTo(
          $$("[data-char]", line),
          { opacity: 0, filter: "blur(18px)", xPercent: -30 },
          { opacity: 1, filter: "blur(0px)", xPercent: 0, duration: 0.8, ease: "power2.out", stagger: 0.035, clearProps: "filter,transform" },
          0.75,
        );
      });
      blurIn('[data-reveal="lead"]', 1.3, 10, 0.6);
      blurIn('[data-reveal="demo"]', 1.5, 10, 0.6);
      tl.to(glow, { opacity: 1, duration: 0.45, ease: "power1.out" }, 1.6);
      tl.to(glow, { opacity: 0, duration: 0.9, ease: "power1.inOut" }, 2.05);
      tl.fromTo(scene, { "--sun": 0 }, { "--sun": 1, duration: 1.1, ease: "power2.inOut" }, 1.75);
      tl.fromTo(
        '[data-reveal="card"]',
        { opacity: 0, filter: "blur(10px)", yPercent: 6 },
        { opacity: 1, filter: "blur(0px)", yPercent: 0, duration: 0.7, ease: "power2.out", clearProps: "filter" },
        1.9,
      );
      blurIn('[data-reveal="discover"]', 1.95, 10, 0.6);
      const r = { v: 0 };
      tl.to(r, { v: RING_FILL, duration: 1.2, ease: "power2.out", onUpdate: () => setRing(r.v) }, 2.1);
    }
  }
})();
