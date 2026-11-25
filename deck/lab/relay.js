import { paint, phases, hardware } from "./world.js";
const cssURL = new URL("relay.css", import.meta.url).href;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const seconds = 20;
const stepTitles = phases.map((p) => p.title);
function rootFor(el, content) {
  const shadow = el.attachShadow({ mode: "open" });
  const style = document.createElement("link");
  style.rel = "stylesheet";
  style.href = cssURL;
  shadow.append(style);
  const template = document.createElement("template");
  template.innerHTML = content;
  shadow.append(template.content.cloneNode(true));
  // Keep Slidev keyboard navigation from consuming arrow keys used inside form widgets.
  shadow.addEventListener("keydown", (e) => {
    if (
      e.target.matches("input,select,button") &&
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        " ",
        "Home",
        "End",
      ].includes(e.key)
    )
      e.stopPropagation();
  });
  return shadow;
}
class ToteMission extends HTMLElement {
  constructor() {
    super();
    this.t = 0;
    this.playing = false;
    this.returned = false;
    this.fault = "normal";
    this.released = false;
    this.camera = 0;
    this.targetCamera = 0;
    this.raf = 0;
    this.stamp = 0;
    this.waiting = false;
    this.reduce = matchMedia("(prefers-reduced-motion: reduce)");
    this.root = rootFor(
      this,
      `
      <div class="mission">
        <div class="console-top">
          <label>任务<select class="kind"><option value="supply">整箱补料</option><option value="return">空箱回收</option></select></label>
          <label>异常演练<select class="fault"><option value="normal">正常交付</option><option value="occupied">目标站占用</option><option value="lost">回执丢失</option></select></label>
          <button class="camera quiet" type="button" aria-pressed="false" title="切换观察视角">切换俯视</button>
        </div>
        <div class="visual"><div class="status"><i></i><span>等待开始</span></div><canvas role="img" aria-label="递格 T1 在备料站与装配工位之间推拉整箱的立体动作示意"></canvas><div class="clock" aria-hidden="true"></div></div>
        <div class="transport"><button class="toggle" type="button">播放演示</button><label class="scrub"><span class="sr">演示进度</span><input type="range" min="0" max="1000" value="0" step="1"></label><button class="reset quiet" type="button">复位</button></div>
        <div class="steps" role="group" aria-label="跳至指定动作"></div>
        <div class="readout"><p class="info" role="status"></p><button type="button" class="resolve" hidden></button></div>
        <div class="ledger" hidden></div>
      </div>`,
    );
    this.$ = (s) => this.root.querySelector(s);
    this.canvas = this.$("canvas");
    this.range = this.$(".scrub input");
    const steps = this.$(".steps");
    phases.forEach((phase, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML =
        "<small>0" + (i + 1) + "</small><span>" + phase.title + "</span>";
      b.addEventListener("click", () => {
        this.stop();
        this.seek(phase.at);
      });
      steps.append(b);
    });
    this.buttons = [...steps.children];
    this.$(".toggle").addEventListener("click", () =>
      this.playing ? this.stop() : this.play(),
    );
    this.$(".reset").addEventListener("click", () => this.restart());
    this.$(".camera").addEventListener("click", () => {
      this.targetCamera = 1 - this.targetCamera;
      if (this.reduce.matches) this.camera = this.targetCamera;
      this.$(".camera").setAttribute(
        "aria-pressed",
        String(!!this.targetCamera),
      );
      this.$(".camera").textContent = this.targetCamera
        ? "切换等距"
        : "切换俯视";
      this.request();
      this.draw();
    });
    this.$(".kind").addEventListener("change", (e) => {
      this.returned = e.target.value === "return";
      this.restart();
    });
    this.$(".fault").addEventListener("change", (e) => {
      this.fault = e.target.value;
      this.restart();
      if (this.fault !== "normal") {
        const gate = this.gate();
        if (this.reduce.matches) this.seek(gate);
        else {
          this.seek(gate - 0.085);
          this.play();
        }
      }
    });
    this.$(".resolve").addEventListener("click", () => {
      this.released = true;
      this.waiting = false;
      this.update();
      this.play();
    });
    this.range.addEventListener("input", () => {
      const next = Number(this.range.value) / 1000;
      this.stop();
      this.seek(next);
    });
    this.onVisibility = () => {
      if (document.hidden) this.stop();
    };
    this.onReduce = () => {
      if (this.reduce.matches) {
        this.stop();
        this.camera = this.targetCamera;
        this.draw();
      }
    };
    this.lastMessage = "";
  }
  connectedCallback() {
    this.resize = new ResizeObserver(() => this.draw());
    this.resize.observe(this.canvas);
    this.visible = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry.isIntersecting && this.playing) this.stop();
        if (
          entry.intersectionRatio >= 0.35 &&
          !this.startedOnEntry &&
          this.hasAttribute("autoplay")
        ) {
          this.startedOnEntry = true;
          if (!this.reduce.matches && !document.hidden && this.t === 0)
            this.play();
        }
      },
      { threshold: [0, 0.35] },
    );
    this.visible.observe(this);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.reduce.addEventListener("change", this.onReduce);
    document.fonts.ready.then(() => {
      if (this.isConnected) this.draw();
    });
    this.update();
    this.draw();
  }
  disconnectedCallback() {
    this.stop();
    this.resize?.disconnect();
    this.visible?.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.reduce.removeEventListener("change", this.onReduce);
  }
  gate() {
    return this.fault === "occupied"
      ? 0.735
      : this.fault === "lost"
        ? 0.985
        : 1;
  }
  restart() {
    this.stop();
    this.released = false;
    this.waiting = false;
    this.seek(0);
  }
  seek(value) {
    const blocked =
      this.fault !== "normal" && !this.released && value >= this.gate();
    this.t = clamp(blocked ? this.gate() : value, 0, 1);
    this.waiting = blocked;
    if (blocked || this.t >= 1) this.playing = false;
    this.update();
    this.draw();
  }
  play() {
    if (this.waiting) return;
    if (this.t >= 1) this.restart();
    this.playing = true;
    this.stamp = performance.now();
    this.update();
    this.request();
  }
  stop() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.stamp = 0;
    this.update();
  }
  request() {
    if (!this.raf && this.isConnected)
      this.raf = requestAnimationFrame((now) => this.frame(now));
  }
  frame(now) {
    this.raf = 0;
    const delta = Math.min(
      0.09,
      Math.max(0, (now - (this.stamp || now)) / 1000),
    );
    this.stamp = now;
    if (Math.abs(this.camera - this.targetCamera) > 0.002)
      this.camera +=
        (this.targetCamera - this.camera) * (1 - Math.exp(-delta * 10));
    else this.camera = this.targetCamera;
    if (this.playing) this.seek(this.t + delta / seconds);
    else this.draw();
    if (this.playing || this.camera !== this.targetCamera) this.request();
  }
  update() {
    const index = Math.max(0, hardware(this.t, this.returned).phase);
    this.range.value = String(Math.round(this.t * 1000));
    this.range.setAttribute(
      "aria-valuetext",
      Math.round(this.t * 100) + "%，" + stepTitles[index],
    );
    this.root.host.style.setProperty("--progress", this.t * 100 + "%");
    this.buttons.forEach((b, i) =>
      b.setAttribute("aria-pressed", String(i === index)),
    );
    const lost = this.fault === "lost",
      blocked = this.waiting;
    const label = blocked
      ? lost
        ? "待补传回执"
        : "等待目标空位"
      : this.t >= 1
        ? "交付已登记"
        : this.playing
          ? stepTitles[index]
          : this.t === 0
            ? "准备就绪"
            : "已暂停";
    this.$(".status span").textContent = label;
    this.$(".status").classList.toggle("held", blocked);
    this.$(".mission").classList.toggle("running", this.playing);
    this.$(".toggle").textContent = this.playing
      ? "暂停演示"
      : this.t >= 1
        ? "重新播放"
        : this.t === 0
          ? "播放演示"
          : "继续播放";
    this.$(".toggle").disabled = blocked;
    this.$(".clock").textContent =
      String(Math.floor(this.t * seconds)).padStart(2, "0") + " / 20 s";
    const action = this.$(".resolve");
    action.hidden = !blocked;
    action.textContent = lost ? "补传同一回执" : "模拟工位清空";
    const msg = blocked
      ? lost
        ? "业务端已入账，应答在途中丢失。车端等待以原序号补传。"
        : "目标站仍有料箱，车辆在等待位保持载荷。"
      : this.t >= 1
        ? this.returned
          ? "空箱已进回空口 R，一条回收记录已确认。"
          : "工位 A 已收箱，一条交付记录已确认。"
        : phases[index].note;
    if (this.lastMessage !== msg) {
      this.$(".info").textContent = msg;
      this.lastMessage = msg;
    }
    const ledger = this.$(".ledger");
    ledger.hidden = !lost;
    if (lost) {
      const key = (this.returned ? "RET" : "SUP") + "-01 / 07";
      const sent = this.t >= 0.985 ? (this.released ? [key, key] : [key]) : [];
      const accepted = new Set(sent);
      ledger.textContent =
        key +
        "　·　实物交接 " +
        Number(this.t >= 0.97) +
        " 次　·　事件发送 " +
        sent.length +
        " 次　·　业务登记 " +
        accepted.size +
        " 条";
    }
    this.dataset.phase = String(index + 1);
    this.dataset.state = blocked
      ? "held"
      : this.t >= 1
        ? "done"
        : this.playing
          ? "playing"
          : "paused";
  }
  draw() {
    if (this.canvas)
      paint(this.canvas, {
        t: this.t,
        returned: this.returned,
        fault: this.fault,
        released: this.released,
        camera: this.camera,
      });
  }
}
class LineBudget extends HTMLElement {
  constructor() {
    super();
    this.root = rootFor(
      this,
      `<div class="budget">
      <div class="budget-result"><small>预计每小时交付</small><div><output class="rate">17.0</output><em>箱 / h</em></div><p>单次循环 <strong class="cycle">180</strong> s</p></div>
      <div class="budget-inputs">
        <label>单程距离 <b><output class="dist">50</output> m</b><input class="distance" type="range" min="25" max="100" step="5" value="50"></label>
        <label>站口常规等待 <b><output class="dwell">15</output> s</b><input class="delay" type="range" min="5" max="45" step="5" value="15"></label>
        <div class="time-bar" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="legend"><span>行驶 <b></b></span><span>取放 40 s</span><span>等待 <b></b></span></div>
        <button class="baseline" type="button">恢复基准工况</button>
      </div></div>`,
    );
    const $ = (s) => this.root.querySelector(s);
    this.distance = $(".distance");
    this.delay = $(".delay");
    this.draw = () => {
      const d = Number(this.distance.value),
        wait = Number(this.delay.value),
        drive = (2 * d) / 0.8,
        cycle = drive + 40 + wait;
      $(".dist").textContent = d;
      $(".dwell").textContent = wait;
      $(".cycle").textContent = +cycle.toFixed(1);
      $(".rate").textContent = ((3600 * 0.85) / cycle).toFixed(1);
      const bars = this.root.querySelectorAll(".time-bar i");
      [drive, 40, wait].forEach((v, i) => (bars[i].style.flexGrow = String(v)));
      const legends = this.root.querySelectorAll(".legend b");
      legends[0].textContent = drive + " s";
      legends[1].textContent = wait + " s";
      this.dataset.rate = $(".rate").textContent;
    };
    this.root.addEventListener("input", this.draw);
    $(".baseline").addEventListener("click", () => {
      this.distance.value = 50;
      this.delay.value = 15;
      this.draw();
    });
  }
  connectedCallback() {
    this.draw();
  }
}
if (!customElements.get("tote-mission"))
  customElements.define("tote-mission", ToteMission);
if (!customElements.get("line-budget"))
  customElements.define("line-budget", LineBudget);
