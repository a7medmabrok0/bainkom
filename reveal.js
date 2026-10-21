(() => {
  const reveal = document.querySelector('.architectural-reveal');
  const photo = reveal?.querySelector('.architectural-reveal__image--realistic');
  const drawingImage = reveal?.querySelector('.architectural-reveal__image--wireframe');
  if (!reveal || !photo) return;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // phones / touch screens: no hover, so the mask wanders around the middle of the hero on its own
  const autoWander = matchMedia('(hover: none), (max-width: 700px)');
  const current = { x: .5, y: .5 };
  const velocity = { x: 0, y: 0, size: 0 }; // spring state for the hover mask (px per frame)
  const target = { x: .5, y: .5 };
  const depth = { x: 0, y: 0, tiltX: 0, tiltY: 0 };
  const depthTarget = { x: 0, y: 0, tiltX: 0, tiltY: 0 };
  const flow = { x: 1, y: 0, targetX: 1, targetY: 0, strength: 0, target: 0, steadyEdge: 0, sizeScale: 1 };
  const droplets = [];
  // the image layers are drawn a bit larger than the hero so the 3D tilt never shows an edge
  const SCALE = 1.08;
  const hero = reveal.closest('.architectural-hero') || reveal;
  const strokes = [];
  let canvas, context, maskCanvas, maskContext, gooCanvas, gooContext, observer, frame = 0, width = 0, height = 0;
  let lastFrame = 0, lastPointer, lastSplash = 0, ambientTimer, strokeCount = 0, lastMotion = 0;
  let active = false, dragging = false, mainScale = 0, ambientAlpha = 1;

  function radius() {
    return width <= 700 ? Math.max(85, Math.min(width * .26, 135)) : Math.max(140, Math.min(width * .15, 230));
  }

  function waterPath(cx, cy, size, time, tail = 0, steadyEdge = 0) {
    const path = new Path2D();
    const points = 128;
    for (let i = 0; i <= points; i++) {
      const angle = i / points * Math.PI * 2;
      const movingWave = reducedMotion.matches ? 0 : Math.sin(angle * 3 + .5) * .06 + Math.sin(angle * 5 - .8) * .018;
      const restingWave = reducedMotion.matches ? 0 :
        Math.sin(angle * 3 + time * .0013) * .11 +
        Math.sin(angle * 7 - time * .0021) * .055 +
        Math.sin(angle * 11 + time * .0017) * .025 +
        Math.sin(angle * 16 - time * .0028) * .009;
      const wave = restingWave * (1 - steadyEdge) + movingWave * steadyEdge;
      const facing = Math.cos(angle) * flow.x + Math.sin(angle) * flow.y;
      const taperedTail = Math.pow(Math.max(0, -facing), 6) * tail * .9;
      const distance = size * (1 + wave + taperedTail);
      const x = cx + Math.cos(angle) * distance;
      const y = cy + Math.sin(angle) * distance;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
    return path;
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  // Ambient brush strokes (inspired by landonorris.com): a fast streak with a
  // thick rounded head, a long tapering tail split into strands, and a soft shadow.
  const routes = [
    // gentle horizontal sweep
    [[-.3, .42], [.15, .36], [.45, .47], [.75, .4], [1.3, .48]],
    // wave that dips through the middle
    [[-.3, .3], [.2, .28], [.5, .55], [.8, .62], [1.3, .5]],
    // big S, like the sketch: top right → curls through the middle → bottom left
    [[1.3, .2], [.62, .17], [.42, .4], [.64, .63], [.46, .82], [.1, .7], [-.35, .6]],
    // low sweep that rises at the end
    [[-.3, .74], [.25, .7], [.55, .6], [.85, .38], [1.3, .3]]
  ];

  function catmull(points, t) {
    const segments = points.length - 1;
    const index = Math.min(segments - 1, Math.floor(t * segments));
    const u = t * segments - index;
    const p0 = points[Math.max(0, index - 1)], p1 = points[index];
    const p2 = points[index + 1], p3 = points[Math.min(segments, index + 2)];
    const u2 = u * u, u3 = u2 * u;
    const f = (a, b, c, d) => .5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }

  function spawnStroke() {
    if (!canvas || !width || !height) return;
    // no auto strokes while the visitor is moving the mouse
    if (active || mainScale > 0) {
      ambientTimer = setTimeout(spawnStroke, 500);
      return;
    }
    const base = routes[Math.floor(Math.random() * routes.length)];
    const mirrorX = Math.random() < .5, mirrorY = Math.random() < .3;
    const jitter = () => (Math.random() - .5) * .1;
    const points = base.map(([x, y], i) => {
      const inner = i > 0 && i < base.length - 1;
      const px = x + (inner ? jitter() : 0), py = y + (inner ? jitter() : 0);
      return { x: width * (mirrorX ? 1 - px : px), y: height * (mirrorY ? 1 - py : py) };
    });
    // resample by arc length so the head moves at an even speed
    const raw = [];
    for (let i = 0; i <= 240; i++) raw.push(catmull(points, i / 240));
    const lengths = [0];
    for (let i = 1; i < raw.length; i++) lengths.push(lengths[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
    const total = lengths[lengths.length - 1];
    const minSide = Math.min(width, height);
    strokes.push({
      raw, lengths, total,
      width: minSide * (.085 + Math.random() * .03),
      trail: total * (.42 + Math.random() * .12),
      born: performance.now(),
      // the head crosses the whole route in ~2.6s, then keeps going until the tail is gone
      speed: total / ((width > 700 ? 2600 : 2200) + Math.random() * 400),
      phase: Math.random() * Math.PI * 2
    });
    const stroke = strokes[strokes.length - 1];
    stroke.extent = Math.max(...strands.map(strand => strand.lag * stroke.width + strand.length * stroke.trail));
    schedule();
  }

  // next stroke only starts after the previous one has fully left the hero
  function queueNextStroke() {
    strokeCount = (strokeCount + 1) % 3;
    const gap = strokeCount === 0 ? 2400 + Math.random() * 800 : 500 + Math.random() * 400;
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(spawnStroke, gap);
  }

  function headDistance(stroke, time) {
    // gentle ease-in, then a steady glide
    const elapsed = time - stroke.born, ramp = 700;
    return stroke.speed * (elapsed < ramp ? elapsed * elapsed / (2 * ramp) : elapsed - ramp / 2);
  }

  function strokeGone(stroke, time) {
    return headDistance(stroke, time) - stroke.extent > stroke.total + stroke.width * 1.5;
  }

  function pointAt(stroke, distance) {
    const { raw, lengths, total } = stroke;
    if (distance <= 0) {
      const dx = raw[1].x - raw[0].x, dy = raw[1].y - raw[0].y, l = Math.hypot(dx, dy) || 1;
      return { x: raw[0].x + dx / l * distance, y: raw[0].y + dy / l * distance, tx: dx / l, ty: dy / l };
    }
    if (distance >= total) {
      const a = raw[raw.length - 2], b = raw[raw.length - 1];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
      return { x: b.x + dx / l * (distance - total), y: b.y + dy / l * (distance - total), tx: dx / l, ty: dy / l };
    }
    let lo = 0, hi = lengths.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (lengths[mid] < distance) lo = mid; else hi = mid;
    }
    const a = raw[lo], b = raw[hi];
    const u = (distance - lengths[lo]) / (lengths[hi] - lengths[lo] || 1);
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: a.x + dx * u, y: a.y + dy * u, tx: dx / l, ty: dy / l };
  }

  // The stroke as one continuous shape: a union of overlapping discs along the
  // spine, thick and round at the head and tapering smoothly into a long tail.
  const strands = [{ length: 1, lag: 0 }];

  function strokePath(stroke, time) {
    const head = headDistance(stroke, time);
    const path = new Path2D();
    const count = 240;
    for (let i = 0; i <= count; i++) {
      const u = i / count; // 0 = tail end, 1 = head
      const p = pointAt(stroke, head - stroke.trail * (1 - u));
      const sway = Math.sin(u * Math.PI * 2.2 + stroke.phase + time * .0016) * stroke.width * .09 * (1 - u);
      const r = stroke.width * Math.pow(u, 1.35);
      if (r < .5) continue;
      const x = p.x - p.ty * sway, y = p.y + p.tx * sway;
      path.moveTo(x + r, y);
      path.arc(x, y, r, 0, Math.PI * 2);
    }
    return path;
  }

  function render(time) {
    frame = 0;
    if (!width || !height) {
      const bounds = reveal.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
    }
    const step = Math.min(2.5, (time - (lastFrame || time)) / 16.67);
    lastFrame = time;
    if (autoWander.matches && !dragging && !reducedMotion.matches && canvas) {
      // smooth figure-of-eight style path, kept in the centre of the screen
      const t = time * .001;
      target.x = .5 + Math.sin(t * .55) * .24 + Math.sin(t * 1.3 + 1) * .06;
      target.y = .4 + Math.sin(t * .8 + .6) * .14 + Math.cos(t * 1.7) * .04;
      active = true;
      lastMotion = time;
    } else if (active && !dragging && lastMotion && time - lastMotion > 850) hide();
    if (reducedMotion.matches || (!active && mainScale === 0)) {
      // hidden: park the mask on the pointer so it doesn't fly in from far away
      current.x = target.x;
      current.y = target.y;
      velocity.x = velocity.y = 0;
    } else {
      // damped spring: the mask has mass, so it lags, glides on and overshoots a little
      const stiffness = .05, damping = .76;
      velocity.x += ((target.x - current.x) * width) * stiffness * step;
      velocity.y += ((target.y - current.y) * height) * stiffness * step;
      velocity.x *= Math.pow(damping, step);
      velocity.y *= Math.pow(damping, step);
      current.x += velocity.x * step / (width || 1);
      current.y += velocity.y * step / (height || 1);
    }
    const speed = Math.hypot(velocity.x, velocity.y);
    for (const key of ['x', 'y', 'tiltX', 'tiltY']) {
      depth[key] += (depthTarget[key] - depth[key]) * (reducedMotion.matches ? 1 : .12);
    }
    mainScale += ((active ? 1 : 0) - mainScale) * (reducedMotion.matches ? 1 : .09);
    if (mainScale < .005) mainScale = 0;
    ambientAlpha += ((active ? 0 : 1) - ambientAlpha) * (reducedMotion.matches ? 1 : .12);
    // the tail and stretch follow the mask's real velocity, not the raw pointer
    if (speed > .4) {
      flow.targetX = velocity.x / speed;
      flow.targetY = velocity.y / speed;
    }
    flow.x += (flow.targetX - flow.x) * .14;
    flow.y += (flow.targetY - flow.y) * .14;
    const motion = Math.min(1, speed / 14);
    flow.strength += (Math.min(1.2, speed / 12) - flow.strength) * .1;
    flow.steadyEdge += ((speed > 1.5 ? 1 : 0) - flow.steadyEdge) * .12;
    // size is a spring too: shrinks while travelling, then wobbles back like jelly when it stops
    velocity.size += ((1 - motion * .26) - flow.sizeScale) * .09 * step;
    velocity.size *= Math.pow(.78, step);
    flow.sizeScale += velocity.size * step;

    const cx = (current.x * width - width / 2 - depth.x) / SCALE + width / 2;
    const cy = (current.y * height - height / 2 - depth.y) / SCALE + height / 2;
    reveal.style.setProperty('--reveal-x', `${width ? cx / width * 100 : 50}%`);
    reveal.style.setProperty('--reveal-y', `${height ? cy / height * 100 : 50}%`);
    reveal.style.setProperty('--reveal-opacity', String(mainScale));
    reveal.style.setProperty('--depth-x', `${depth.x}px`);
    reveal.style.setProperty('--depth-y', `${depth.y}px`);
    reveal.style.setProperty('--tilt-x', `${depth.tiltX}deg`);
    reveal.style.setProperty('--tilt-y', `${depth.tiltY}deg`);
    // the hero text sits on its own plane and drifts the other way, so the scene reads in depth
    hero.style.setProperty('--hero-shift-x', `${-depth.x * .35}px`);
    hero.style.setProperty('--hero-shift-y', `${-depth.y * .35}px`);
    reveal.style.setProperty('--light-x', `${current.x * 100}%`);
    reveal.style.setProperty('--light-y', `${current.y * 100}%`);

    if (context && (mainScale > 0 || strokes.length || droplets.length)) {
      const size = radius() * mainScale * flow.sizeScale;
      const path = mainScale > 0 ? waterPath(cx, cy, size, time, flow.strength, flow.steadyEdge) : null;
      const imageRatio = photo.naturalWidth / photo.naturalHeight;
      const boxRatio = width / height;
      const drawWidth = boxRatio > imageRatio ? width : height * imageRatio;
      const drawHeight = boxRatio > imageRatio ? width / imageRatio : height;

      maskContext.clearRect(0, 0, width, height);
      // The mouse mask and its drops are drawn solid, then run through a "goo"
      // filter (blur + alpha threshold): edges stay sharp and nearby shapes melt
      // together, so drops stretch away from the mask like a thick liquid.
      gooContext.clearRect(0, 0, width, height);
      gooContext.fillStyle = '#fff';
      if (path) gooContext.fill(path);
      for (let i = droplets.length - 1; i >= 0; i--) {
        const drop = droplets[i];
        // no gravity: just viscous drag
        drop.x += drop.vx * step;
        drop.y += drop.vy * step;
        drop.vx *= Math.pow(.95, step);
        drop.vy *= Math.pow(.95, step);
        drop.life -= step / 150;
        if (drop.life <= 0) {
          droplets.splice(i, 1);
          continue;
        }
        // swell in quickly, then melt away slowly (smoothstep on both ends)
        const age = 1 - drop.life;
        const grow = Math.min(1, age / .12), fade = Math.min(1, drop.life / .6);
        const r = drop.size * grow * grow * (3 - 2 * grow) * fade * fade * (3 - 2 * fade);
        if (r < .5) continue;
        // irregular but soft outline: a couple of slow, low-frequency wobbles
        gooContext.beginPath();
        for (let k = 0; k <= 28; k++) {
          const a = k / 28 * Math.PI * 2;
          const wobble = 1 + Math.sin(a * 2 + drop.angle + time * .0014) * .17 + Math.sin(a * 3 - drop.angle * 1.7 - time * .001) * .09;
          const px = drop.x + Math.cos(a) * r * wobble, py = drop.y + Math.sin(a) * r * wobble * .9;
          if (k === 0) gooContext.moveTo(px, py); else gooContext.lineTo(px, py);
        }
        gooContext.closePath();
        gooContext.fill();
      }
      if (path || droplets.length) {
        maskContext.save();
        maskContext.setTransform(1, 0, 0, 1, 0, 0);
        maskContext.filter = 'url(#bainkom-goo)';
        maskContext.drawImage(gooCanvas, 0, 0);
        maskContext.restore();
      }

      const strokeShapes = [];
      for (let i = strokes.length - 1; i >= 0; i--) {
        if (strokeGone(strokes[i], time) || (active && ambientAlpha < .02)) {
          strokes.splice(i, 1);
          queueNextStroke();
          continue;
        }
        const shape = strokePath(strokes[i], time);
        strokeShapes.push(shape);
        maskContext.save();
        maskContext.globalAlpha = ambientAlpha;
        maskContext.filter = 'blur(2.5px)';
        maskContext.fillStyle = '#fff';
        maskContext.fill(shape);
        maskContext.restore();
      }

      context.clearRect(0, 0, width, height);
      context.save();
      context.drawImage(photo, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      if ((drawingImage?.naturalWidth || drawingImage?.videoWidth) && !reducedMotion.matches) {
        const driftX = Math.sin(time * .00095) * 2.4;
        const driftY = Math.cos(time * .00072) * 1.8;
        context.globalAlpha = .105;
        context.drawImage(drawingImage, (width - drawWidth) / 2 + driftX, (height - drawHeight) / 2 + driftY, drawWidth, drawHeight);
        context.globalAlpha = 1;
      }
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(maskCanvas, 0, 0, width, height);
      if (strokeShapes.length) {
        // soft shadow the stroke casts on the drawing, slightly below and longer
        context.globalCompositeOperation = 'destination-over';
        context.filter = 'blur(14px)';
        context.fillStyle = `rgba(38, 42, 36, ${.16 * ambientAlpha})`;
        context.translate(10, 22);
        for (const shape of strokeShapes) context.fill(shape);
      }
      context.restore();

      if (path && mainScale > .02 && !reducedMotion.matches) {
        const size = radius() * mainScale * flow.sizeScale;
        // glass-lens shading: a soft highlight top-left and a shade bottom-right make the reveal bulge out
        context.save();
        context.globalCompositeOperation = 'source-atop';
        let shade = context.createRadialGradient(cx - size * .42, cy - size * .5, 0, cx - size * .42, cy - size * .5, size * 1.05);
        shade.addColorStop(0, `rgba(255, 246, 230, ${.34 * mainScale})`);
        shade.addColorStop(1, 'rgba(255, 246, 230, 0)');
        context.fillStyle = shade;
        context.fillRect(0, 0, width, height);
        shade = context.createRadialGradient(cx + size * .55, cy + size * .62, 0, cx + size * .55, cy + size * .62, size * 1.1);
        shade.addColorStop(0, `rgba(24, 28, 30, ${.24 * mainScale})`);
        shade.addColorStop(1, 'rgba(24, 28, 30, 0)');
        context.fillStyle = shade;
        context.fillRect(0, 0, width, height);
        // thin rim light along the upper-left edge
        const rim = context.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
        rim.addColorStop(0, `rgba(255, 255, 255, ${.85 * mainScale})`);
        rim.addColorStop(.45, 'rgba(255, 255, 255, 0)');
        context.strokeStyle = rim;
        context.lineWidth = 3;
        context.stroke(path);
        context.restore();
        // the lens floats above the model: a blurred contact shadow falls down and away from the light
        context.save();
        context.globalCompositeOperation = 'destination-over';
        context.filter = 'blur(26px)';
        context.fillStyle = `rgba(28, 32, 30, ${.3 * mainScale})`;
        context.translate(-depth.x * .4 + 6, 26 - depth.y * .4);
        context.fill(path);
        context.restore();
      }

      canvas.style.opacity = '1';
    } else if (canvas) {
      context.clearRect(0, 0, width, height);
      canvas.style.opacity = '0';
    }

    if (!reducedMotion.matches && ((active && !!context) || mainScale > 0 || strokes.length || droplets.length ||
      Math.abs(current.x - target.x) > .001 || Math.abs(current.y - target.y) > .001 ||
      Math.abs(depth.x - depthTarget.x) > .05 || Math.abs(depth.y - depthTarget.y) > .05 ||
      Math.abs(depth.tiltX - depthTarget.tiltX) > .01 || Math.abs(depth.tiltY - depthTarget.tiltY) > .01)) schedule();
  }

  function resize() {
    if (!canvas) return;
    const bounds = reveal.getBoundingClientRect();
    width = bounds.width;
    height = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    maskCanvas.width = gooCanvas.width = canvas.width;
    maskCanvas.height = gooCanvas.height = canvas.height;
    gooContext.setTransform(scale, 0, 0, scale, 0, 0);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    maskContext.setTransform(scale, 0, 0, scale, 0, 0);
    schedule();
  }

  function enhance() {
    if (!photo.naturalWidth || canvas || !window.Path2D || !window.ResizeObserver) return;
    const element = document.createElement('canvas');
    const drawing = element.getContext('2d', { alpha: true });
    if (!drawing || !('filter' in drawing)) return;
    canvas = element;
    context = drawing;
    maskCanvas = document.createElement('canvas');
    maskContext = maskCanvas.getContext('2d', { alpha: true });
    gooCanvas = document.createElement('canvas');
    gooContext = gooCanvas.getContext('2d', { alpha: true });
    if (!maskContext || !gooContext) {
      canvas = context = maskCanvas = gooCanvas = null;
      return;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="bainkom-goo" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="9"/><feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 26 -12"/></filter>';
    reveal.append(svg);
    canvas.className = 'architectural-reveal__water';
    canvas.setAttribute('aria-hidden', 'true');
    reveal.append(canvas);
    reveal.classList.add('architectural-reveal--water');
    observer = new ResizeObserver(resize);
    observer.observe(reveal);
    resize();
    // spawnStroke(); // auto brush strokes turned off
  }

  function moveToPointer(event) {
    const bounds = reveal.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    const now = event.timeStamp;
    if (lastPointer && !reducedMotion.matches) {
      const dx = (x - lastPointer.x) * bounds.width;
      const dy = (y - lastPointer.y) * bounds.height;
      const elapsed = Math.max(1, now - lastPointer.time);
      const distance = Math.hypot(dx, dy);
      const speed = distance / elapsed;
      if (distance > 2) {
        flow.targetX = dx / distance;
        flow.targetY = dy / distance;
        flow.target = Math.min(1.25, Math.max(.35, speed * .9));
      }
      if (active && mainScale > .6 && speed > .8 && now - lastSplash > 140 && droplets.length < 7) {
        const ux = dx / distance, uy = dy / distance;
        const amount = Math.min(7 - droplets.length, speed > 2.4 ? 2 : 1);
        const edge = radius() * mainScale * flow.sizeScale;
        for (let i = 0; i < amount; i++) {
          const side = (Math.random() - .5) * edge * .9;
          const behind = edge * (.78 + Math.random() * .15);
          droplets.push({
            x: (x * bounds.width - behind * ux - side * uy - depth.x) / SCALE + bounds.width * (.5 - .5 / SCALE),
            y: (y * bounds.height - behind * uy + side * ux - depth.y) / SCALE + bounds.height * (.5 - .5 / SCALE),
            vx: -ux * (.5 + Math.random() * .7) - uy * (Math.random() - .5) * 1,
            vy: -uy * (.5 + Math.random() * .7) + ux * (Math.random() - .5) * 1,
            size: 16 + Math.random() * 18,
            angle: Math.random() * Math.PI,
            life: .9 + Math.random() * .1
          });
        }
        lastSplash = now;
      }
    }
    lastPointer = { x, y, time: now };
    target.x = x;
    target.y = y;
    depthTarget.x = reducedMotion.matches ? 0 : (x - .5) * 46;
    depthTarget.y = reducedMotion.matches ? 0 : (y - .5) * 30;
    depthTarget.tiltX = reducedMotion.matches ? 0 : (.5 - y) * 6.5;
    depthTarget.tiltY = reducedMotion.matches ? 0 : (x - .5) * 6.5;
    schedule();
  }
  function show() {
    active = true;
    lastMotion = performance.now();
    schedule();
  }
  function hide() {
    active = false;
    lastPointer = null;
    depthTarget.x = depthTarget.y = depthTarget.tiltX = depthTarget.tiltY = 0;
    schedule();
  }

  if (photo.complete) enhance();
  else photo.addEventListener('load', enhance, { once: true });
  reveal.addEventListener('pointerenter', event => {
    if (event.pointerType === 'touch') return;
    moveToPointer(event);
  });
  reveal.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' && !dragging) return;
    const previous = lastPointer;
    moveToPointer(event);
    if (!previous || Math.hypot((lastPointer.x - previous.x) * width, (lastPointer.y - previous.y) * height) > 2) show();
  });
  reveal.addEventListener('pointerleave', event => {
    if (event.pointerType !== 'touch') hide();
  });
  reveal.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    dragging = true;
    reveal.setPointerCapture(event.pointerId);
    moveToPointer(event);
    show();
  });
  reveal.addEventListener('pointerup', event => {
    if (event.pointerType === 'touch') { dragging = false; hide(); }
  });
  reveal.addEventListener('pointercancel', event => {
    if (event.pointerType === 'touch') { dragging = false; hide(); }
  });
  reveal.addEventListener('blur', hide);
  reveal.addEventListener('keydown', event => {
    const direction = {
      ArrowLeft: [-.08, 0], ArrowRight: [.08, 0], ArrowUp: [0, -.08], ArrowDown: [0, .08]
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    target.x = Math.max(0, Math.min(1, target.x + direction[0]));
    target.y = Math.max(0, Math.min(1, target.y + direction[1]));
    show();
  });
  window.addEventListener('pagehide', () => {
    if (frame) cancelAnimationFrame(frame);
    clearTimeout(ambientTimer);
    observer?.disconnect();
  }, { once: true });
})();
