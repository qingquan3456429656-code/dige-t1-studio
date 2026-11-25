const parts = [
  [
    "620 × 420",
    "mm",
    "托盘平面尺寸。标准周转箱固定在转接托盘上，箱体、物料和托盘的总重上限为 20 kg。",
  ],
  ["680", "mm", "水平伸缩行程。钩锁、重量与到位信号共同确认整箱已上车。"],
  [
    "≥450",
    "mm",
    "站口净宽。有效导轨深度至少 650 mm，入口导向面引导托盘，末端限位确认到位。",
  ],
];
const detail = document.querySelector(".part-detail");
document.querySelectorAll("[data-pick]").forEach((button) =>
  button.addEventListener("click", () => {
    const i = Number(button.dataset.pick),
      part = parts[i];
    document
      .querySelectorAll("[data-pick]")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.pick) === i)),
      );
    const strong = detail.querySelector("strong"),
      unit = document.createElement("small");
    unit.textContent = part[1];
    strong.replaceChildren(part[0] + " ", unit);
    detail.querySelector("p").textContent = part[2];
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
      detail.animate(
        [
          { opacity: 0.55, transform: "translateY(3px)" },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: 250 },
      );
  }),
);
document
  .getElementById("print")
  .addEventListener("click", () => window.print());
const hero = document.querySelector(".hero"),
  copy = document.querySelector(".hero-art");
if (
  matchMedia("(pointer:fine) and (prefers-reduced-motion:no-preference)")
    .matches
) {
  let frame = 0,
    dx = 0,
    dy = 0;
  function apply() {
    frame = 0;
    copy.style.setProperty("--mx", dx + "px");
    copy.style.setProperty("--my", dy + "px");
  }
  hero.addEventListener("pointermove", (e) => {
    const rect = hero.getBoundingClientRect();
    dx = ((e.clientX - rect.left - rect.width / 2) / rect.width) * 5;
    dy = ((e.clientY - rect.top - rect.height / 2) / rect.height) * 4;
    if (!frame) frame = requestAnimationFrame(apply);
  });
  hero.addEventListener("pointerleave", () => {
    dx = 0;
    dy = 0;
    if (!frame) frame = requestAnimationFrame(apply);
  });
}
