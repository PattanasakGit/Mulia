// R3 shared: like R2 but with both speaker modes and all three roles.
// ?state=playing|tap|hidden|mode (single, this=speaker) | listener (single, this=listener) | remote (single, this=remote) | all (listen together, this=listener)
(function () {
  const Q = new URLSearchParams(location.search);
  const THEME = Q.get("theme") || "dark", STATE = Q.get("state") || "playing";
  const html = document.documentElement;
  html.dataset.theme = THEME; html.classList.add("r2"); html.dataset.state = STATE;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (str) => { const t = document.createElement("template"); t.innerHTML = str.trim(); return t.content.firstElementChild; };
  const IC = window.IC, A = "../assets/";
  const NOW = { id: "kJQP7kiw5Fk", title: "Luis Fonsi - Despacito ft. Daddy Yankee", t: "1:45", d: "4:42", p: 37 };
  const MODE = STATE === "all" ? "all" : "single";
  const ROLE = STATE === "remote" ? "remote" : (STATE === "listener" || STATE === "all") ? "listener" : "speaker";
  const REMOTE = ROLE === "remote";
  const P = {
    "ต้น": { n: "ต้น", e: "🦊", bg: "rgb(240,225,219)" }, "มิ้นท์": { n: "มิ้นท์", e: "🐰", bg: "rgb(226,230,240)" },
    "บอส": { n: "บอส", e: "🐻", bg: "rgb(240,234,219)" }, "แพร": { n: "แพร", e: "🐱", bg: "rgb(232,240,219)" },
  };
  const SELF = REMOTE ? "บอส" : STATE === "listener" ? "มิ้นท์" : "ต้น";
  const DEVICES = MODE === "single"
    ? [["ต้น", "speaker"], ["มิ้นท์", "listener"], ["บอส", "remote"], ["แพร", "remote"]]
    : [["ต้น", "listener"], ["มิ้นท์", "listener"], ["บอส", "listener"], ["แพร", "remote"]];
  const avatar = (p, s = 30) => `<span class="avatar" aria-hidden="true" style="width:${s}px;height:${s}px;background:${p.bg};font-family:'Noto Color Emoji',sans-serif;font-size:${Math.round(s * .72)}px">${p.e}</span>`;
  const sz = (svg, n) => svg.replace(/width="\d+" height="\d+"/, `width="${n}" height="${n}"`);
  const roleChip = (r) => r === "speaker" ? `<span class="spk-role">${IC.speaker}ลำโพง</span>` : r === "listener" ? `<span class="spk-role is-listener">${IC.listen}ฟังด้วย</span>` : `<span class="spk-role is-remote">${IC.remote}รีโมต</span>`;
  const playingNow = !["tap", "hidden"].includes(STATE);

  const R2 = {
    STATE, THEME, MODE, ROLE, $, $$, h, IC, NOW, REMOTE,
    isMobile: () => innerWidth <= 480,
    player() {
      let inner = `<img class="yt-frame" src="${A}${NOW.id}-max.jpg" alt=""><div class="yt-shade"></div><span class="yt-tag">YouTube player (iframe)</span>`;
      if (STATE === "tap") inner += `<div class="yt-title">${NOW.title}</div><span class="yt-bigplay" aria-hidden="true"></span><span class="yt-mark abs"><span class="yt-logo"></span>YouTube</span>`;
      else {
        const pp = playingNow ? '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></svg>';
        inner += `<div class="yt-chrome"><div class="yt-bar"><span style="width:${NOW.p}%"></span></div><div class="yt-row">${pp}<svg viewBox="0 0 24 24"><path d="M4 9v6h4l5 4V5L8 9z"/></svg><span>${NOW.t} / ${NOW.d}</span><span class="sp"></span><svg viewBox="0 0 24 24"><path d="M3 5h18v14H3zm2 2v10h14V7z"/></svg><span class="yt-mark"><span class="yt-logo"></span>YouTube</span><svg viewBox="0 0 24 24"><path d="M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z"/></svg></div></div>`;
      }
      return h(`<div class="yt-wrap"><div class="yt" id="yt-player" data-player aria-label="YouTube player (iframe)">${inner}</div></div>`);
    },
    credit() {
      return h(`<p class="yt-credit"><span class="src"><span class="yt-logo"></span>วิดีโอจาก YouTube</span><a href="https://www.youtube.com/watch?v=${NOW.id}">ดูบน YouTube ↗</a></p>`);
    },
    notice() {
      if (STATE === "hidden") return h(`<div class="r2-note" role="status"><span class="ic">${sz(IC.pause, 18)}</span><div><strong>หยุดชั่วคราวเพราะสลับแท็บ — แตะเพื่อเล่นต่อ</strong><span>ลำโพงต้องเปิดหน้านี้ไว้ เครื่องเล่น YouTube จึงจะเล่นได้</span></div><button class="btn" type="button">เล่นต่อ</button></div>`);
      if (STATE === "tap") return h(`<div class="tap-wrap"><button class="tap-cta" type="button"><i>${sz(IC.play, 18)}</i>แตะเพื่อฟัง</button><p>ไม่เล่นอัตโนมัติ — เสียงเริ่มเมื่อคุณแตะ ผ่านเครื่องเล่น YouTube</p></div>`);
      return null;
    },
    remoteCard() {
      return h(`<section class="rm-card" aria-label="เครื่องนี้เป็นรีโมต"><img src="${A}${NOW.id}-mq.jpg" alt="ภาพปกจาก YouTube"><div>
        <p class="rm-where"><span>เครื่องนี้เป็นรีโมต · ไม่มีเสียงและไม่มีวิดีโอ</span>เสียงเล่นที่ <strong>เครื่องของ ต้น</strong><span class="speaker-live" role="img" aria-label="ออนไลน์"></span></p>
        <p class="yt-credit"><span class="src"><span class="yt-logo"></span>วิดีโอจาก YouTube</span><a href="#">ดูบน YouTube ↗</a></p></div></section>`);
    },
    speakerCard() {
      const confirming = STATE === "mode";
      const where = MODE === "all" ? "ทุกเครื่องในห้อง" : ROLE === "speaker" ? "เครื่องนี้" : "เครื่องของ ต้น";
      const actions = {
        "single-speaker": [[IC.remote, "ให้เครื่องนี้เป็นรีโมต"]],
        "single-listener": [[IC.remote, "เลิกฟังด้วย"], [IC.claim, "เล่นเสียงที่เครื่องนี้"]],
        "single-remote": [[IC.claim, "เล่นเสียงที่เครื่องนี้"], [IC.listen, "ฟังด้วยที่เครื่องนี้"]],
        "all-listener": [[IC.remote, "ปิดเสียงเครื่องนี้"]],
      }[`${MODE}-${ROLE}`].map(([i, t]) => `<button type="button" class="speaker-row">${sz(i, 19)}<span>${t}</span></button>`).join("");
      const note = confirming
        ? `<p class="spk-note is-warn">เปลี่ยนเป็น “ทุกเครื่องฟังพร้อมกัน” มีผลกับทุกคน: ทุกเครื่องจะเล่นเสียงเองและแสดงเครื่องเล่น YouTube ของตัวเอง</p>`
        : `<p class="spk-note">${{
            "single-speaker": "เครื่องนี้เล่นเสียงให้ทั้งห้อง คนอื่นเป็นรีโมตหรือเลือกฟังด้วย",
            "single-listener": "ลำโพงหลักคือเครื่องของ ต้น · เครื่องนี้ฟังด้วย จึงมีเสียงและเครื่องเล่น YouTube ของตัวเอง",
            "single-remote": "เครื่องเดียวเล่นเสียงให้ทั้งห้อง เครื่องนี้ใช้กดเล่น ข้าม และจัดคิว",
            "all-listener": "ทุกเครื่องเล่นเสียงเองพร้อมกัน แต่ละเครื่องแสดงเครื่องเล่น YouTube ของตัวเอง",
          }[`${MODE}-${ROLE}`]}</p>`;
      const devices = `<p class="spk-head"><span>อุปกรณ์ในห้อง</span><span>4 เครื่อง</span></p><ul class="spk-devices">${DEVICES.map(([n, r]) => `<li>${avatar(P[n], 28)}<span class="nm">เครื่องของ ${n}${n === SELF ? "<small>(เครื่องนี้)</small>" : ""}</span>${roleChip(r)}</li>`).join("")}</ul>`;
      const single = MODE === "single";
      return h(`<section class="spk-card" aria-label="ลำโพงของห้อง">
        <div class="speaker-where"><span class="speaker-where-icon" aria-hidden="true">${sz(MODE === "all" ? IC.group : IC.speaker, 20)}</span>
          <span class="speaker-where-text"><span>เสียงเล่นที่</span><strong>${where}</strong></span>${roleChip(ROLE)}${single ? '<span class="speaker-live" role="img" aria-label="ออนไลน์"></span>' : ""}</div>
        <div class="spk-seg" role="radiogroup" aria-label="โหมดเสียงของห้อง">
          <button type="button" role="radio" aria-checked="${single}">${IC.speaker}<span>ลำโพงเครื่องเดียว</span></button>
          <button type="button" role="radio" aria-checked="${!single}" class="${confirming ? "is-confirming" : ""}">${IC.group}<span>${confirming ? "แตะอีกครั้งเพื่อยืนยัน" : "ทุกเครื่องฟังพร้อมกัน"}</span></button>
        </div>
        ${note}${devices}${actions}
      </section>`);
    },
    footer() {
      return h(`<footer class="r2-foot"><a href="/terms">ข้อกำหนดการใช้งาน</a><a href="/privacy">นโยบายความเป็นส่วนตัว</a><a href="https://www.youtube.com/t/terms">ข้อกำหนดของ YouTube ↗</a><p>MULIA ใช้บริการ YouTube API · เล่นผ่านเครื่องเล่น YouTube อย่างเป็นทางการ · สำหรับฟังส่วนตัว</p></footer>`);
    },
    baseEdits() {
      $(".people-count").textContent = "4";
      $(".people-stack").setAttribute("aria-label", "ผู้ฟัง 4 คน");
      $$("img").forEach((i) => { const m = i.src.match(/i\.ytimg\.com\/vi\/([\w-]+)\//); if (m) i.src = `${A}${m[1]}-hq.jpg`; });
      $$(".progress-times span")[0].textContent = STATE === "tap" ? "0:00" : NOW.t;
      if (!playingNow) {
        $$(".is-spinning").forEach((e) => e.classList.remove("is-spinning"));
        $(".progress")?.classList.remove("is-running");
        const pm = $(".play-main"); pm.innerHTML = IC.play; pm.setAttribute("aria-label", "เล่น");
        $(".queue-now") && ($(".queue-now").textContent = "หยุดไว้");
      }
      const t = $(".speaker-trigger");
      if (ROLE === "remote") { t.innerHTML = IC.remote; t.setAttribute("aria-label", "เสียงเล่นที่ เครื่องของ ต้น · เครื่องนี้ไม่มีเสียง"); }
      if (ROLE === "listener") { t.innerHTML = sz(IC.listen, 22); t.setAttribute("aria-label", MODE === "all" ? "เสียงเล่นที่ ทุกเครื่อง" : "เสียงเล่นที่ เครื่องของ ต้น · ฟังด้วยที่เครื่องนี้"); }
      if (SELF !== "ต้น") {
        const np = $(".nav-person"); np.querySelector(".avatar").textContent = P[SELF].e; np.querySelector(".nav-name").textContent = SELF; np.setAttribute("aria-label", `${SELF} (เปลี่ยนชื่อ)`);
        $(".close-room")?.remove();
      }
      $(".visual-note")?.remove();
      $(".app").append(R2.footer());
    },
  };
  window.R2 = R2;
})();
