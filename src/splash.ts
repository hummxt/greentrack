import gsap from "gsap";

const COLS = 21;
const ROWS = 7;
const HEAT = ["#2a2824", "#3e4f42", "#5c7260", "#7d9478", "#a3b59a"];
const prefersLessMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function heatAt(index: number): number {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const wave = Math.sin(col * 0.42 + row * 0.38) * 0.5 + 0.5;
  const extra = Math.sin(col * 0.19) * 0.18;
  const value = wave + extra - row * 0.04;

  if (value > 0.78) return 4;
  if (value > 0.58) return 3;
  if (value > 0.4) return 2;
  if (value > 0.24) return 1;
  return 0;
}

function makeGrid(root: HTMLElement) {
  root.innerHTML = "";
  const cells: HTMLElement[] = [];

  for (let i = 0; i < COLS * ROWS; i += 1) {
    const cell = document.createElement("i");
    const level = heatAt(i);
    cell.className = "splash-cell";
    cell.dataset.level = String(level);
    if (level > 0) cell.classList.add("is-lit");
    root.appendChild(cell);
    cells.push(cell);
  }

  return cells;
}

function makeWeekBar(root: HTMLElement) {
  root.innerHTML = "";
  for (let i = 0; i < 52; i += 1) {
    const tick = document.createElement("span");
    tick.style.background = HEAT[heatAt(i + 21)];
    root.appendChild(tick);
  }
}

function playDust(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => undefined;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const specks = Array.from({ length: 18 }, () => ({
    x: Math.random(),
    y: Math.random(),
    w: 1.6 + Math.random() * 4.2,
    h: 1.4 + Math.random() * 3.8,
    speed: 0.00003 + Math.random() * 0.0001,
    fade: 0.06 + Math.random() * 0.12,
  }));

  const fitCanvas = () => {
    canvas.width = Math.floor(window.innerWidth * pixelRatio);
    canvas.height = Math.floor(window.innerHeight * pixelRatio);
  };

  fitCanvas();
  window.addEventListener("resize", fitCanvas);

  const draw = () => {
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    for (const speck of specks) {
      speck.y -= speck.speed;
      if (speck.y < -0.03) speck.y = 1.03;
      ctx.fillStyle = `rgba(163, 181, 154, ${speck.fade})`;
      ctx.fillRect(speck.x * width, speck.y * height, speck.w * pixelRatio, speck.h * pixelRatio);
    }
  };

  gsap.ticker.add(draw);

  return () => {
    gsap.ticker.remove(draw);
    window.removeEventListener("resize", fitCanvas);
  };
}

export async function playSplash() {
  const splash = document.querySelector<HTMLElement>("#splash");
  if (!splash) return;

  let alreadyDone = false;
  let stopDust: () => void = () => undefined;

  const closeSplash = () => {
    if (alreadyDone) return;
    alreadyDone = true;
    stopDust();
    splash.remove();
    gsap.fromTo("#app", { opacity: 0.7, scale: 1.012 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power2.out" });
  };

  if (prefersLessMotion) {
    closeSplash();
    return;
  }

  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => window.setTimeout(resolve, 500)),
  ]);

  const grid = splash.querySelector<HTMLElement>("#splash-grid");
  const weeks = splash.querySelector<HTMLElement>("#splash-weeks");
  const canvas = splash.querySelector<HTMLCanvasElement>("#splash-fx");
  if (!grid || !weeks || !canvas) {
    closeSplash();
    return;
  }

  const cells = makeGrid(grid);
  const lit = cells.filter((cell) => cell.classList.contains("is-lit"));
  makeWeekBar(weeks);
  stopDust = playDust(canvas);

  gsap.set(grid, { rotateX: 64, rotateZ: -26, scale: 1.22 });
  gsap.set(cells, { scale: 0, opacity: 0 });
  gsap.set(lit, { backgroundColor: HEAT[0] });
  gsap.set(".splash-mark", { scale: 0.42, rotation: -18, opacity: 0 });
  gsap.set(".splash-char", { y: 46, opacity: 0, rotateX: 70 });
  gsap.set("#splash-weeks span", { scaleY: 0 });
  gsap.set(".splash-sweep", { xPercent: -60, opacity: 0 });
  gsap.set("#app", { opacity: 0 });

  const intro = gsap.timeline({ defaults: { ease: "power3.out" } });

  intro.to(cells, {
    scale: 1,
    opacity: 1,
    duration: 0.55,
    stagger: { amount: 1.05, grid: [COLS, ROWS], from: "center" },
    ease: "back.out(1.5)",
  });
  intro.to(".splash-sweep", { opacity: 1, duration: 0.3 }, 0.2);
  intro.to(".splash-sweep", { xPercent: 70, duration: 2.4, ease: "sine.inOut" }, 0.25);

  intro.to(
    lit,
    {
      backgroundColor: (i: number) => HEAT[Number(lit[i].dataset.level) || 1],
      duration: 0.18,
      stagger: { amount: 1.55, from: "start" },
      ease: "none",
    },
    0.55,
  );

  intro.to(grid, { rotateX: 10, rotateZ: -6, scale: 1.04, duration: 1.55, ease: "power2.inOut" }, 1.55);

  intro.to(cells, { opacity: 0.14, duration: 0.7, ease: "power2.out" }, 2.55);
  intro.to(".splash-mark", { scale: 1, rotation: 0, opacity: 1, duration: 0.75, ease: "back.out(1.7)" }, 2.63);
  intro.to(".splash-char", { y: 0, opacity: 1, rotateX: 0, duration: 0.58, stagger: 0.038 }, 2.77);
  intro.to("#splash-weeks span", { scaleY: 1, duration: 0.35, stagger: 0.018, ease: "power2.out" }, 3);

  intro.addLabel("out", 4.85);
  intro.to(grid, { scale: 1.85, opacity: 0, duration: 0.95, ease: "power2.in" }, "out");
  intro.to(".splash-brand", { y: -28, opacity: 0, duration: 0.5, ease: "power2.in" }, "out+=0.12");
  intro.to(".splash-weeks", { opacity: 0, y: 10, duration: 0.4 }, "out+=0.08");
  intro.to(".splash-fx, .splash-vignette, .splash-sweep, .splash-grain", { opacity: 0, duration: 0.45 }, "out+=0.2");
  intro.to(splash, { opacity: 0, duration: 0.55, ease: "power2.inOut" }, "out+=0.28");

  intro.eventCallback("onComplete", closeSplash);
}
