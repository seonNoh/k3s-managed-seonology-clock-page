import { useEffect, useRef, memo } from 'react';

const CursorCanvas = memo(function CursorCanvas({ effect }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({
    mouse: { x: -200, y: -200 },
    prev: { x: -200, y: -200 },
    particles: [],
    points: [],
    time: 0,
  });

  useEffect(() => {
    if (effect === 'none') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const state = stateRef.current;
    let raf;

    // Reset on effect change
    state.particles = [];
    state.points = [];
    state.time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initEffect();
    };

    const handleMouse = (e) => {
      state.prev = { ...state.mouse };
      state.mouse = { x: e.clientX, y: e.clientY };
    };

    function initEffect() {
      state.particles = [];
      state.points = [];

      if (effect === 'magnetic') {
        const cols = Math.ceil(canvas.width / 50);
        const rows = Math.ceil(canvas.height / 50);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            state.points.push({
              ox: c * 50 + 25, oy: r * 50 + 25,
              x: c * 50 + 25, y: r * 50 + 25,
            });
          }
        }
      }

      if (effect === 'constellation') {
        state.points = Array.from({ length: 50 }, () => ({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
        }));
      }

      if (effect === 'snow') {
        state.particles = Array.from({ length: 80 }, () => ({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: 1 + Math.random() * 3,
          speed: 0.3 + Math.random() * 1.2,
          wobble: Math.random() * Math.PI * 2,
          shimmer: Math.random() * Math.PI * 2,
          shimmerSpeed: 0.02 + Math.random() * 0.04,
        }));
      }

      if (effect === 'fireflies') {
        state.particles = Array.from({ length: 25 }, () => ({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          orbitR: 60 + Math.random() * 180,
          drift: Math.random() * Math.PI * 2,
        }));
      }

      if (effect === 'wave') {
        // No special init needed
      }
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouse);

    const animate = () => {
      state.time++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { mouse, prev } = state;
      const md = Math.sqrt((mouse.x - prev.x) ** 2 + (mouse.y - prev.y) ** 2);

      switch (effect) {
        /* ===== TRAIL ===== */
        case 'trail': {
          if (mouse.x > 0) {
            state.particles.push({ x: mouse.x, y: mouse.y, life: 1 });
          }
          state.particles.forEach(p => {
            p.life -= 0.025;
            const a = Math.max(0, p.life);
            const s = a * 14;
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
            grad.addColorStop(0, `rgba(129, 140, 248, ${a * 0.7})`);
            grad.addColorStop(1, `rgba(129, 140, 248, 0)`);
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          if (state.particles.length > 40) state.particles.splice(0, state.particles.length - 40);
          break;
        }

        /* ===== COMET ===== */
        case 'comet': {
          if (mouse.x > 0) {
            state.particles.push({ x: mouse.x, y: mouse.y, life: 1 });
          }
          // Tail
          state.particles.forEach(p => {
            p.life -= 0.016;
            const a = Math.max(0, p.life);
            const s = a * 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(245, 158, 11, ${a * 0.4})`;
            ctx.fill();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          if (state.particles.length > 60) state.particles.splice(0, state.particles.length - 60);
          // Head glow
          if (mouse.x > 0) {
            const g = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 25);
            g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
            g.addColorStop(0.3, 'rgba(245, 158, 11, 0.6)');
            g.addColorStop(1, 'rgba(245, 158, 11, 0)');
            ctx.beginPath();
            ctx.arc(mouse.x, mouse.y, 25, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
          }
          break;
        }

        /* ===== PARTICLES ===== */
        case 'particles': {
          if (md > 2 && mouse.x > 0) {
            for (let i = 0; i < 3; i++) {
              const angle = Math.random() * Math.PI * 2;
              const spd = 1 + Math.random() * 3;
              state.particles.push({
                x: mouse.x, y: mouse.y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: 1,
                size: 2 + Math.random() * 4,
                hue: 300 + Math.random() * 60,
              });
            }
          }
          state.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.03;
            p.vx *= 0.99;
            p.life -= 0.012;
            const a = Math.max(0, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, ${a * 0.7})`;
            ctx.fill();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          if (state.particles.length > 200) state.particles.splice(0, state.particles.length - 200);
          break;
        }

        /* ===== RIPPLE ===== */
        case 'ripple': {
          if (md > 8 && mouse.x > 0 && state.time % 6 === 0) {
            state.particles.push({ x: mouse.x, y: mouse.y, r: 0, life: 1 });
          }
          state.particles.forEach(p => {
            p.r += 2.5;
            p.life -= 0.012;
            const a = Math.max(0, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(99, 102, 241, ${a * 0.4})`;
            ctx.lineWidth = 1.5 * a;
            ctx.stroke();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          break;
        }

        /* ===== FIREFLIES ===== */
        case 'fireflies': {
          state.particles.forEach(p => {
            p.phase += 0.015;
            p.drift += 0.008;
            const tx = mouse.x + Math.cos(p.phase * 1.3 + p.drift) * p.orbitR;
            const ty = mouse.y + Math.sin(p.phase + p.drift * 0.7) * p.orbitR;
            p.x += (tx - p.x) * 0.015;
            p.y += (ty - p.y) * 0.015;

            const flicker = 0.3 + 0.7 * Math.sin(p.phase * 4) ** 2;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 10);
            g.addColorStop(0, `rgba(251, 191, 36, ${flicker * 0.7})`);
            g.addColorStop(1, 'rgba(251, 191, 36, 0)');
            ctx.beginPath();
            ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
            ctx.fillStyle = g;
            ctx.fill();
            // Core
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 220, ${flicker * 0.9})`;
            ctx.fill();
          });
          break;
        }

        /* ===== BUBBLES ===== */
        case 'bubbles': {
          if (md > 4 && mouse.x > 0 && state.time % 4 === 0) {
            state.particles.push({
              x: mouse.x + (Math.random() - 0.5) * 30,
              y: mouse.y,
              r: 5 + Math.random() * 15,
              life: 1,
              vx: (Math.random() - 0.5) * 0.5,
              wobble: Math.random() * Math.PI * 2,
            });
          }
          state.particles.forEach(p => {
            p.y -= 1;
            p.wobble += 0.03;
            p.x += Math.sin(p.wobble) * 0.6 + p.vx;
            p.life -= 0.004;
            const a = Math.max(0, p.life);
            // Bubble outline
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(56, 189, 248, ${a * 0.35})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
            // Highlight
            ctx.beginPath();
            ctx.arc(p.x - p.r * 0.3, p.y - p.r * 0.3, p.r * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${a * 0.35})`;
            ctx.fill();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          if (state.particles.length > 80) state.particles.splice(0, state.particles.length - 80);
          break;
        }

        /* ===== STARDUST ===== */
        case 'stardust': {
          if (md > 2 && mouse.x > 0) {
            state.particles.push({
              x: mouse.x + (Math.random() - 0.5) * 16,
              y: mouse.y + (Math.random() - 0.5) * 16,
              life: 1,
              size: 2 + Math.random() * 5,
              twinkle: Math.random() * Math.PI * 2,
              vy: -0.3 - Math.random() * 0.8,
              vx: (Math.random() - 0.5) * 0.5,
              rot: Math.random() * Math.PI,
            });
          }
          state.particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.twinkle += 0.08;
            p.rot += 0.02;
            p.life -= 0.008;
            const a = Math.max(0, p.life) * (0.4 + 0.6 * Math.abs(Math.sin(p.twinkle)));
            const s = p.size;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = `rgba(192, 132, 252, ${a})`;
            // 4-point star
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
            ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
            ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
            ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
            ctx.fill();
            ctx.restore();
          });
          state.particles = state.particles.filter(p => p.life > 0);
          if (state.particles.length > 150) state.particles.splice(0, state.particles.length - 150);
          break;
        }

        /* ===== SNOW ===== */
        case 'snow': {
          state.particles.forEach(p => {
            p.y += p.speed;
            p.wobble += 0.015;
            p.x += Math.sin(p.wobble) * 0.4;
            // Cursor push
            const dx = p.x - mouse.x;
            const dy = p.y - mouse.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < 150 && d > 0) {
              const f = (150 - d) / 150 * 1.5;
              p.x += (dx / d) * f;
              p.y += (dy / d) * f * 0.3;
            }
            if (p.y > canvas.height + 10) { p.y = -10; p.x = Math.random() * canvas.width; }
            if (p.x < -20) p.x = canvas.width + 10;
            if (p.x > canvas.width + 20) p.x = -10;

            // Shimmer animation
            p.shimmer += p.shimmerSpeed;
            const shimmerVal = Math.sin(p.shimmer);
            const glowing = shimmerVal > 0.85;

            // Draw snowflake crystal
            const baseAlpha = 0.2 + p.r / 4 * 0.3;
            const alpha = glowing ? Math.min(1, baseAlpha + (shimmerVal - 0.85) * 4 * 0.6) : baseAlpha;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.wobble * 0.5);

            // Glow aura when shimmering
            if (glowing) {
              const glowIntensity = (shimmerVal - 0.85) / 0.15;
              const glowR = p.r * (1.8 + glowIntensity * 1.2);
              const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, glowR);
              grad.addColorStop(0, `rgba(200, 220, 255, ${glowIntensity * 0.35})`);
              grad.addColorStop(1, 'rgba(200, 220, 255, 0)');
              ctx.beginPath();
              ctx.arc(0, 0, glowR, 0, Math.PI * 2);
              ctx.fillStyle = grad;
              ctx.fill();
            }

            ctx.strokeStyle = `rgba(226, 232, 240, ${alpha})`;
            ctx.lineWidth = Math.max(0.5, p.r * 0.25);
            ctx.lineCap = 'round';
            const branches = 6;
            const len = p.r;
            for (let i = 0; i < branches; i++) {
              const angle = (Math.PI * 2 / branches) * i;
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              // Main branch
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(cos * len, sin * len);
              ctx.stroke();
              // Side branches at 60% length
              const bx = cos * len * 0.6;
              const by = sin * len * 0.6;
              const sideLen = len * 0.35;
              const leftAngle = angle + Math.PI / 4;
              const rightAngle = angle - Math.PI / 4;
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx + Math.cos(leftAngle) * sideLen, by + Math.sin(leftAngle) * sideLen);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(bx, by);
              ctx.lineTo(bx + Math.cos(rightAngle) * sideLen, by + Math.sin(rightAngle) * sideLen);
              ctx.stroke();
            }
            ctx.restore();
          });
          break;
        }

        /* ===== MAGNETIC ===== */
        case 'magnetic': {
          state.points.forEach(p => {
            const dx = mouse.x - p.ox;
            const dy = mouse.y - p.oy;
            const d = Math.sqrt(dx * dx + dy * dy);
            const maxD = 200;
            if (d < maxD && d > 0) {
              const pull = ((maxD - d) / maxD) ** 2;
              p.x += (p.ox + dx * pull * 0.35 - p.x) * 0.15;
              p.y += (p.oy + dy * pull * 0.35 - p.y) * 0.15;
            } else {
              p.x += (p.ox - p.x) * 0.08;
              p.y += (p.oy - p.y) * 0.08;
            }
            const dist = Math.sqrt((mouse.x - p.x) ** 2 + (mouse.y - p.y) ** 2);
            const a = dist < maxD ? 0.08 + ((maxD - dist) / maxD) * 0.45 : 0.04;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(99, 102, 241, ${a})`;
            ctx.fill();
          });
          break;
        }

        /* ===== CONSTELLATION ===== */
        case 'constellation': {
          state.points.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

            const dd = Math.sqrt((p.x - mouse.x) ** 2 + (p.y - mouse.y) ** 2);
            const a = dd < 200 ? 0.7 : 0.1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(129, 140, 248, ${a})`;
            ctx.fill();
          });
          // Lines to cursor and between nearby points
          for (let i = 0; i < state.points.length; i++) {
            const a = state.points[i];
            const dc = Math.sqrt((a.x - mouse.x) ** 2 + (a.y - mouse.y) ** 2);
            if (dc < 160) {
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(mouse.x, mouse.y);
              ctx.strokeStyle = `rgba(129, 140, 248, ${(1 - dc / 160) * 0.25})`;
              ctx.lineWidth = 0.8;
              ctx.stroke();
            }
            for (let j = i + 1; j < state.points.length; j++) {
              const b = state.points[j];
              const d = Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
              if (d < 100) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.strokeStyle = `rgba(129, 140, 248, ${(1 - d / 100) * 0.12})`;
                ctx.lineWidth = 0.5;
                ctx.stroke();
              }
            }
          }
          break;
        }

        /* ===== WAVE ===== */
        case 'wave': {
          for (let w = 0; w < 4; w++) {
            ctx.beginPath();
            const amp = 25 + w * 12;
            const freq = 0.008 - w * 0.001;
            const yBase = canvas.height * (0.2 + w * 0.2);
            const yOff = (mouse.y - canvas.height / 2) * 0.08;

            for (let x = 0; x <= canvas.width; x += 4) {
              const xDist = Math.abs(x - mouse.x);
              const influence = Math.max(0, 1 - xDist / 250) * 50;
              const y = yBase + yOff + Math.sin(x * freq + state.time * 0.025 + w * 0.8) * (amp + influence);
              if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = `rgba(6, 182, 212, ${0.12 - w * 0.02})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          break;
        }

        /* ===== SPOTLIGHT ===== */
        case 'spotlight': {
          if (mouse.x < 0) break;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          const sg = ctx.createRadialGradient(mouse.x, mouse.y, 0, mouse.x, mouse.y, 220);
          sg.addColorStop(0, 'rgba(0, 0, 0, 1)');
          sg.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)');
          sg.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 220, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
      }

      raf = requestAnimationFrame(animate);
    };

    raf = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouse);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [effect]);

  if (effect === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        width: '100%',
        height: '100%',
      }}
    />
  );
});

export default CursorCanvas;
