/*
 * Flow Tab Bar: the site's glass menu bar, fixed at the bottom of the window.
 *
 * A dark glass bar whose active tab is a bead of liquid glass. The bead rests on the current page's tab; clicking
 * another tab sinks the bead into the bar, carries it under the glass as a low wave, resurfaces it at the new tab
 * with a small bounce (its light changing colour), then opens that page.
 *
 * The glass, the bead and the lights are one WebGL2 fragment shader; the icons (inline SVG) and labels (HTML) sit
 * over the canvas and are placed by the same per-frame state. The tabs are real links. Without WebGL2 a plain CSS
 * pill is shown instead; with reduced motion the click opens the page straight away.
 *
 * Usage, at the end of <body>:
 *   <script src="<root>assets/flow-tab-bar.js" data-page="home|travel|photography|career|learn|contact"
 *           data-root="<path to the site root, e.g. ../>" defer></script>
 */
(function () {
  "use strict";

  var script = document.currentScript;
  var ROOT = (script && script.dataset.root) || "./";
  var PAGE = (script && script.dataset.page) || "";

  /* ─── Tabs ─── */
  var TABS = [
    { key: "home", name: "Home", href: "" },
    { key: "travel", name: "Travel", href: "photography/travel/" },
    { key: "photography", name: "Photography", href: "photography/" },
    { key: "career", name: "AI Career", href: "career/" },
    { key: "learn", name: "LearnByAmir", href: "LearnbyAmir/" },
    { key: "contact", name: "Contact", href: "contact/" },
  ];

  /* Each tab's light (linear RGB 0 – 1): violet, cyan, amber, pink, mint, coral. */
  var ACC = [
    [0.55, 0.4, 1],
    [0.2, 0.75, 1],
    [1, 0.62, 0.2],
    [1, 0.32, 0.6],
    [0.3, 1, 0.7],
    [1, 0.42, 0.3],
  ];

  /* ─── Geometry, in stage units (the stage is SW × SH, scaled to the window) ─── */
  var SW = 1080, SH = 320, BY = 180;          // stage size; the bar's centre line
  var BAR_W = 958, BAR_H = 124;              // the bar: x 61 – 1019, y 118 – 242
  var BAR_L = (SW - BAR_W) / 2, BAR_T = BY - BAR_H / 2;
  var XS = [165, 315, 465, 615, 765, 915];   // the tabs' centres, 150 apart
  var BELOW = SH - (BY + BAR_H / 2);         // stage below the bar (room for its shadow)
  var GAP = 14;                              // px between the bar and the window's bottom edge
  var MAX_K = 0.62;                          // largest scale (bar ≈ 594 px wide)

  var fitScale = function () {
    return Math.min(MAX_K, (window.innerWidth - 16) / BAR_W);
  };

  /* ─── Math ─── */
  var clamp = function (v, a, b) {
    if (a === undefined) a = 0;
    if (b === undefined) b = 1;
    return Math.min(b, Math.max(a, v));
  };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var eOut = function (u) { return 1 - Math.pow(1 - clamp(u), 5); };
  var eIO = function (u) {
    u = clamp(u);
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  };
  var moveLength = function (n) { return n <= 1 ? 0.7 : n <= 3 ? 0.9 : 1.0; };

  /* The state at time t of a list of moves ({ ts, a, b, d }): the last move that has started decides it. */
  function state(t, moves) {
    var s = { x: XS[0], rise: 1, sx: 1, acc: ACC[0], tap: [0, -1], sw: 0, cur: 0, draw: 1 };
    for (var m = 0; m < moves.length; m++) {
      var ts = moves[m].ts, a = moves[m].a, b = moves[m].b, d = moves[m].d;
      if (t < ts) break;
      var u = eIO((t - ts) / d), k = clamp((t - ts) / d);
      s.x = lerp(XS[a], XS[b], u);
      // the bead sinks into the bar and resurfaces, then settles with a small damped bounce
      var dive = Math.sin(Math.PI * Math.min(1, k * 1.08));
      s.rise = 1 - 0.9 * Math.pow(dive, 0.7);
      if (k >= 1) s.rise = 1 + 0.06 * Math.exp(-(t - ts - d) * 9) * Math.sin((t - ts - d) * 22);
      s.sx = 1 + 0.55 * Math.sin(Math.PI * k) * (Math.abs(b - a) > 1 ? 1.25 : 1);
      s.acc = ACC[a].map(function (v, i) { return lerp(v, ACC[b][i], u); });
      s.tap = [XS[b], t - ts];
      s.sw = clamp((t - ts - d * 0.9) / 0.9);
      s.cur = b;
      // the target icon's strokes erase during the second quarter, then redraw from the middle on
      s.draw = k < 0.5 ? 1 - eIO((k - 0.25) / 0.25) : eOut((t - ts - d * 0.5) / 0.6);
    }
    return s;
  }

  /* ─── Shaders ─── */
  var VS = "#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0.,1.);}";

  // p is in stage units (SW × SH, y down). The glass is premultiplied over the page: outside it, only a soft
  // shadow and the tab light's glow; inside, the frosted glass (a refracted procedural haze), the light in the
  // bead, the tap ripple, the rim and its sheen, the sweep and the bead's specular.
  var FS = [
    "#version 300 es",
    "precision highp float;",
    "uniform vec2 uRes;uniform float uT;uniform vec3 uB,uAcc,uTap;uniform float uSw;",
    "out vec4 o;",
    "const vec2 ST=vec2(" + SW + ".," + SH + ".);const float BY=" + BY + ".;",
    "const float TAU=6.2831853;",
    "float sq(float x){return x*x;}",
    "float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}",
    "float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+1.),f.x),f.y);}",
    "float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*noise(p);p=mat2(1.6,1.2,-1.2,1.6)*p+7.1;a*=.5;}return s;}",
    "float sdBox(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}",
    "float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}",
    "vec2 bead(){return vec2(uB.x,BY-28.-uB.y*46.);}",
    "float shape(vec2 p){",
    " float bar=sdBox(p-vec2(ST.x*.5,BY),vec2(" + BAR_W / 2 + ".," + BAR_H / 2 + ".),46.);",
    " vec2 q=p-bead();float sx=uB.z;q.x/=sx;q.y*=mix(1.,sx,.35);",
    " float bd=(length(q)-46.)*min(1.,1./mix(1.,sx,.35));",
    " return smin(bar,bd,38.);}",
    "vec3 bg(vec2 p){",
    " float ph=TAU*uT/8.;",
    " vec3 c=vec3(.012,.012,.018);",
    " vec2 u=p/1080.;",
    " float n=fbm(u*2.2+vec2(cos(ph),sin(ph))*.18);",
    " c+=vec3(.05,.06,.11)*smoothstep(.35,.85,n)*.7;",
    " vec2 d=p-vec2(uB.x,BY+50.);",
    " c+=uAcc*exp(-dot(d*vec2(1.,1.5),d*vec2(1.,1.5))/(2.*230.*230.))*.42;",
    " vec2 d2=p-vec2(ST.x-uB.x,BY-170.);",
    " c+=uAcc.zxy*exp(-dot(d2,d2)/(2.*300.*300.))*.1;",
    " return c;}",
    "void main(){",
    " vec2 p=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)/uRes*ST;",
    " float d=shape(p);float e=1.5;",
    " vec2 g=vec2(shape(p+vec2(e,0.))-d,shape(p+vec2(0.,e))-d)/e;",
    " float inM=smoothstep(.8,-.8,d);",
    // outside: the light's glow and a soft shadow, faded out before the canvas edges
    " float fade=smoothstep(0.,36.,min(min(p.x,ST.x-p.x),min(p.y,ST.y-p.y)));",
    " vec2 gd=(p-vec2(uB.x,BY+30.))*vec2(1.,1.6);",
    " float ga=.3*exp(-dot(gd,gd)/(2.*120.*120.))*fade;",
    " float sa=.55*exp(-max(d,0.)/30.)*smoothstep(BY-80.,BY+40.,p.y+40.)*fade;",
    " vec3 rgbO=(1.-exp(-uAcc*1.1))*ga*(1.-sa);float aO=1.-(1.-ga)*(1.-sa);",
    " vec3 glass=vec3(0.);",
    " if(inM>0.){",
    "  float edge=exp(d/15.);",
    "  vec2 off=-g*edge*46.;",
    "  vec3 fr=vec3(0.);",
    "  for(int i=0;i<4;i++){float an=float(i)*1.5708+.6;fr+=bg(p+off+vec2(cos(an),sin(an))*40.);}",
    "  fr*=.25;",
    "  glass=fr*.5+vec3(.03,.03,.04);",
    "  glass+=fr*edge*.4;",
    // the light inside the glass, travelling with the active tab
    "  vec2 b=bead();vec2 q=p-vec2(b.x,b.y+10.);",
    "  float l=length(q*vec2(1./uB.z,1.15));",
    "  glass+=uAcc*(exp(-l/78.)*.5+exp(-l/26.)*.55*uB.y)+vec3(1.)*exp(-l/12.)*.12*uB.y;",
    // tap ripple
    "  float r=length(p-vec2(uTap.x,BY));",
    "  glass+=(uAcc*.6+.2)*exp(-sq((r-20.-uTap.y*90.)/3.))*max(0.,1.-uTap.y/.45)*.22*step(0.,uTap.y);",
    // rim
    "  float rim=exp(-sq((d+1.3)/1.1));",
    "  float lit=.2+.8*pow(clamp(dot(normalize(g+1e-4),normalize(vec2(-.35,-.94))),0.,1.),1.4);",
    "  glass+=(vec3(1.)*.55+uAcc*.35)*rim*lit;",
    "  float ang=atan(g.y,g.x);",
    "  glass+=(.5+.5*cos(ang*2.+p.x*.006+vec3(0.,2.1,4.2)))*rim*.16;",
    // one soft light sweep across the glass after each landing
    "  float sx=" + BAR_L + ".+" + BAR_W + ".*uSw+(p.y-BY)*.7;",
    "  glass+=vec3(1.)*exp(-sq((p.x-sx)/46.))*sin(3.14159*uSw)*.06;",
    "  glass+=vec3(1.)*.05*smoothstep(-30.,-4.,d)*clamp((BY-p.y)/62.,0.,1.);",
    // small specular on the bead cap
    "  vec2 s=p-(b+vec2(-14.,-20.)*uB.y);",
    "  glass+=vec3(1.)*exp(-dot(s*vec2(.6,1.4),s*vec2(.6,1.4))/60.)*.22*uB.y;",
    "  glass+=(h21(p)-.5)*.012;",
    "  glass=1.-exp(-glass*1.25);",
    "  glass+=(h21(p+fract(uT*7.))-.5)/255.;",
    " }",
    " float aI=.94;",
    " o=vec4(mix(rgbO,clamp(glass,0.,1.)*aI,inM),mix(aO,aI,inM));}",
  ].join("\n");

  /* ─── Icons: 44 × 44 line art; stroked shapes have pathLength 1 so they can erase and redraw ─── */
  var P = function (d) { return '<path pathLength="1" d="' + d + '"/>'; };
  var C = function (cx, cy, r) { return '<circle pathLength="1" cx="' + cx + '" cy="' + cy + '" r="' + r + '"/>'; };
  var ICONS = [
    // Home: an arch with a door
    P("M10 34V20a12 12 0 0 1 24 0v14") + P("M22 34v-8"),
    // Travel: a globe
    C(22, 22, 12) + P("M10 22h24") + P("M22 10a6.5 12 0 0 1 0 24a6.5 12 0 0 1 0-24"),
    // Photography: a camera
    P("M9 17a2 2 0 0 1 2-2h5l3-4h6l3 4h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z") + C(22, 24, 5),
    // AI Career: a briefcase
    P("M12 16h20a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3z") +
      P("M18 16v-3a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3") + P("M9 24h26"),
    // LearnByAmir: an open book
    P("M22 14c-3-2-8-3-12-2v20c4-1 9 0 12 2c3-2 8-3 12-2V12c-4-1-9 0-12 2z") + P("M22 14v20"),
    // Contact: an envelope
    P("M11 13h22a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V15a2 2 0 0 1 2-2z") + P("M10 15l12 9l12-9"),
  ];

  /* ─── Styles ─── */
  var CSS = [
    ".ftb{position:fixed;left:50%;width:" + SW + "px;height:" + SH + "px;z-index:40;pointer-events:none;",
    "transform-origin:50% 100%;font-family:'Geist',system-ui,sans-serif}",
    ".ftb *{box-sizing:border-box;margin:0;padding:0}",
    ".ftb-blur{position:absolute;left:" + BAR_L + "px;top:" + BAR_T + "px;width:" + BAR_W + "px;height:" + BAR_H + "px;",
    "border-radius:46px;-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}",
    ".ftb-gl{position:absolute;left:0;top:0;width:" + SW + "px;height:" + SH + "px}",
    ".ftb-icon{position:absolute;left:0;top:0;width:44px;height:44px;color:#fff;will-change:transform,opacity}",
    ".ftb-icon svg{display:block;width:44px;height:44px;fill:none;stroke:currentColor;stroke-width:2.4;",
    "stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1}",
    ".ftb-label{position:absolute;left:0;top:0;width:150px;text-align:center;font-weight:500;font-size:22px;",
    "line-height:1.2;letter-spacing:0;color:#fff;white-space:nowrap;will-change:transform,opacity,filter}",
    ".ftb-tab{position:absolute;top:" + BAR_T + "px;width:150px;height:" + BAR_H + "px;border-radius:46px;",
    "pointer-events:auto;color:transparent!important;font-size:0;text-decoration:none;outline:none;-webkit-tap-highlight-color:transparent}",
    ".ftb-tab:focus-visible{box-shadow:inset 0 0 0 3px rgba(255,255,255,.4)}",
    /* no WebGL2: a plain dark pill */
    ".ftb--nogl .ftb-blur{background:rgba(14,16,26,.88);box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.14),0 16px 40px rgba(0,0,0,.5)}",
    ".ftb-space{height:var(--ftb-space,90px)}",
  ].join("");

  /* ─── Build the DOM ─── */
  var cur = Math.max(0, TABS.findIndex(function (t) { return t.key === PAGE; }));
  var home = cur; // this page's own tab

  if (!document.querySelector('link[href*="family=Geist"]')) {
    var font = document.createElement("link");
    font.rel = "stylesheet";
    font.href = "https://fonts.googleapis.com/css2?family=Geist:wght@500&display=swap";
    document.head.appendChild(font);
  }
  var style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "ftb";
  var html = '<div class="ftb-blur"></div><canvas class="ftb-gl" aria-hidden="true"></canvas>';
  TABS.forEach(function (t) { html += '<div class="ftb-label" aria-hidden="true">' + t.name + "</div>"; });
  ICONS.forEach(function (svg) {
    html += '<div class="ftb-icon" aria-hidden="true"><svg viewBox="0 0 44 44">' + svg + "</svg></div>";
  });
  html += '<nav aria-label="Main">';
  TABS.forEach(function (t, i) {
    html += '<a class="ftb-tab" style="left:' + (XS[i] - 75) + 'px" href="' + (ROOT + t.href) + '"' +
      (i === cur ? ' aria-current="page"' : "") + ">" + t.name + "</a>";
  });
  html += "</nav>";
  root.innerHTML = html;

  // keeps the page's last content clear of the bar
  var spacer = document.createElement("div");
  spacer.className = "ftb-space";
  spacer.setAttribute("aria-hidden", "true");
  document.body.appendChild(spacer);
  document.body.appendChild(root);

  var canvas = root.querySelector(".ftb-gl");
  var icons = [].slice.call(root.querySelectorAll(".ftb-icon"));
  var labels = [].slice.call(root.querySelectorAll(".ftb-label"));
  var links = [].slice.call(root.querySelectorAll(".ftb-tab"));
  var strokes = icons.map(function (el) { return [].slice.call(el.querySelectorAll("[pathLength]")); });

  /* ─── WebGL ─── */
  var gl = null, U = {};
  try {
    gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: true });
  } catch (e) { gl = null; }
  if (gl) {
    var compile = function (type, src) {
      var x = gl.createShader(type);
      gl.shaderSource(x, src);
      gl.compileShader(x);
      if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x));
      return x;
    };
    try {
      var pr = gl.createProgram();
      gl.attachShader(pr, compile(gl.VERTEX_SHADER, VS));
      gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var al = gl.getAttribLocation(pr, "a");
      gl.enableVertexAttribArray(al);
      gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
      ["uRes", "uT", "uB", "uAcc", "uTap", "uSw"].forEach(function (n) { U[n] = gl.getUniformLocation(pr, n); });
    } catch (e) {
      console.error("Flow tab bar: WebGL setup failed, showing the plain bar.", e);
      gl = null;
    }
  }
  if (!gl) {
    root.classList.add("ftb--nogl");
    canvas.style.display = "none";
  }

  /* ─── Layout ─── */
  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var layout = function () {
    var k = fitScale();
    root.style.bottom = GAP - BELOW * k + "px";
    root.style.transform = "translateX(-50%) scale(" + k + ")";
    // the room the bar takes at the bottom of the page (plus a little air)
    document.documentElement.style.setProperty("--ftb-space", Math.round(GAP + BAR_H * k + 24) + "px");
    if (gl) {
      canvas.width = Math.round(SW * k * DPR);
      canvas.height = Math.round(SH * k * DPR);
    }
  };

  /* ─── Drawing ─── */
  var draw = function (s, t) {
    if (gl) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uT, t);
      gl.uniform3f(U.uB, s.x, s.rise, s.sx);
      gl.uniform3fv(U.uAcc, s.acc);
      gl.uniform3f(U.uTap, s.tap[0], s.tap[1], 0);
      gl.uniform1f(U.uSw, s.sw);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    icons.forEach(function (el, i) {
      // w: how close the bead is to this tab; a: how far this icon rides up with it
      var w = Math.pow(clamp(1 - Math.abs(s.x - XS[i]) / 96), 1.5),
        a = w * clamp(s.rise);
      el.style.transform = "translate(" + (XS[i] - 22) + "px," + (BY - 22 - 72 * a) + "px) scale(" + (1 + 0.1 * a) + ")";
      el.style.opacity = String(lerp(0.34, 1, clamp(a * 1.3)));
      var dr = i === s.cur ? s.draw : 1;
      strokes[i].forEach(function (q) { q.style.strokeDashoffset = String(1 - dr); });
      // the label fades in from a blur where the icon sat, once the icon is more than halfway up
      var lb = labels[i],
        la = Math.pow(clamp((a - 0.55) / 0.45), 1.5);
      lb.style.opacity = String(la * 0.9);
      lb.style.transform = "translate(" + (XS[i] - 75) + "px," + (BY - 8 + 10 * (1 - la)) + "px)";
      lb.style.filter = la >= 1 ? "none" : "blur(" + (1 - la) * 5 + "px)";
    });
  };

  /* ─── Motion ─── */
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var settled = function (i) { return [{ ts: -1000, a: i, b: i, d: 1 }]; };
  var moves = settled(cur);
  var raf = 0, t0 = 0, until = 0, leaving = false;

  var frame = function () {
    var t = performance.now() / 1000 - t0;
    draw(state(t, moves), 0);
    raf = t < until ? requestAnimationFrame(frame) : 0;
  };
  var still = function () { draw(state(0, moves), 0); };

  var go = function (i) {
    if (leaving || i === cur) return;
    var href = links[i].href;
    if (reduce) { window.location.href = href; return; }
    leaving = true;
    // let the browser fetch the next page while the bead travels
    var pre = document.createElement("link");
    pre.rel = "prefetch";
    pre.href = href;
    document.head.appendChild(pre);
    var d = moveLength(Math.abs(i - cur));
    moves = [{ ts: 0, a: cur, b: i, d: d }];
    cur = i;
    links.forEach(function (l, j) {
      if (j === i) l.setAttribute("aria-current", "page"); else l.removeAttribute("aria-current");
    });
    t0 = performance.now() / 1000;
    until = d + 1.2;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    setTimeout(function () { window.location.href = href; }, (d + 0.18) * 1000);
  };

  links.forEach(function (l, i) {
    l.addEventListener("click", function (e) {
      // new-tab and modified clicks behave as normal links
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      go(i);
    });
  });

  // coming back with the browser's Back button can restore the page mid-move: put the bead home again
  window.addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    cancelAnimationFrame(raf);
    leaving = false;
    cur = home;
    moves = settled(home);
    links.forEach(function (l, j) {
      if (j === home) l.setAttribute("aria-current", "page"); else l.removeAttribute("aria-current");
    });
    still();
  });

  var resizeQueued = false;
  window.addEventListener("resize", function () {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () {
      resizeQueued = false;
      layout();
      if (!raf) still();
    });
  });

  layout();
  still();
})();
