/* 非iPad预览缩放：保持固定布局 */
(function fitStage(){
  const stage = document.getElementById("stage");
  function apply(){
    const sx = window.innerWidth / 1080;
    const sy = window.innerHeight / 810;
    const s = Math.min(sx, sy);
    stage.style.transform = `translate(-50%,-50%) scale(${Math.min(1, s).toFixed(4)})`;
  }
  window.addEventListener("resize", apply);
  apply();
})();

const randInt = (lo,hi)=>Math.floor(Math.random()*(hi-lo+1))+lo;
const nowMs = ()=>Math.floor(performance.now());

const matrixEl = document.getElementById("matrix");
const guideVEl = document.getElementById("guideV");
const guideHEl = document.getElementById("guideH");

const scoreTextEl = document.getElementById("scoreText");
const progFillEl = document.getElementById("progFill");
const iceFillEl = document.getElementById("iceFill");

const timeFillEl = document.getElementById("timeFill");
const timeDigitalEl = document.getElementById("timeDigital");

const keypadEl = document.getElementById("keypad");
const inputValueEl = document.getElementById("inputValue");

const flashOkEl = document.getElementById("flashOk");
const flashBadEl = document.getElementById("flashBad");

/* must match CSS */
const CELL = 56, GAP = 6, OFFSET = 8;

const MAX_PROGRESS = 81;
const QUESTION_TIME_MS = 10_000;


// ===== 81题队列：按“口诀难度”从难到易排序（难->易） =====
// 说明：这里用“常见更难口诀”的经验排序做近似：6/7/8/9 系更难，且部分组合被普遍认为更难。
// 你后续如果拿到更权威的统计表，只需要替换 HARD_TOP / difficultyScore 即可。
const HARD_TOP = new Set([
  "6x9","9x6",
  "7x8","8x7",
  "7x6","6x7",
  "8x6","6x8",
  "7x9","9x7",
  "8x9","9x8",
  "7x7",
  "6x8","8x6",
  "4x8","8x4",
  "4x9","9x4",
  "4x7","7x4",
  "6x7","7x6"
]);

function difficultyScore(a,b){
  let s = 0;
  const hi = Math.max(a,b);
  const lo = Math.min(a,b);

  // 更易：1/2/5
  if(a===1 || b===1) s -= 60;
  if(a===2 || b===2) s -= 25;
  if(a===5 || b===5) s -= 18;

  // 更难：6/7/8/9
  if(a>=6) s += 10;
  if(b>=6) s += 10;
  if(a===7 || b===7) s += 12;
  if(a===8 || b===8) s += 14;
  if(a===9 || b===9) s += 10;

  // 乘积越大略难
  s += (a*b) * 0.10;

  // 双高组合更难
  if(hi>=7 && lo>=6) s += 8;

  // 常见难点强加权
  if(HARD_TOP.has(`${a}x${b}`)) s += 40;

  return s;
}

function buildDeck81(){
  const items = [];
  for(let b=1;b<=9;b++){
    for(let a=1;a<=9;a++){
      items.push({a,b, ans:a*b, score:difficultyScore(a,b)});
    }
  }
  // 先按难度排序（难->易）
  items.sort((x,y)=>y.score - x.score);

  // 再做一次“去规律化”重排：
  // - 尽量避免相邻出现 (a×b) 与 (b×a) 这种对称规律
  // - 同时尽量避免连续相同 a 或 b（次要）
  const remaining = items.slice();
  const deck = [];
  let prev = null;

  function isSymmetric(p, q){
    return p && q && p.a === q.b && p.b === q.a;
  }
  function isSameFactor(p,q){
    return p && q && (p.a===q.a || p.b===q.b);
  }

  while(remaining.length){
    let pickIdx = -1;

    // 从前往后找一个最靠前且不触发对称规律的
    for(let i=0;i<remaining.length;i++){
      const cand = remaining[i];
      if(prev && isSymmetric(prev, cand)) continue;
      pickIdx = i;
      break;
    }

    // 如果实在找不到（极少），允许对称，但尽量不重复因子
    if(pickIdx === -1){
      for(let i=0;i<remaining.length;i++){
        const cand = remaining[i];
        if(prev && isSameFactor(prev, cand)) continue;
        pickIdx = i;
        break;
      }
    }

    // 兜底：就取最前
    if(pickIdx === -1) pickIdx = 0;

    const picked = remaining.splice(pickIdx, 1)[0];
    deck.push(picked);
    prev = picked;
  }

  return deck;
}

/* build 10×10 skeleton, but:
   - top headers use .topHead => no box
   - only current a/b shown, others blank */
matrixEl.innerHTML = "";
const topHeaders = new Array(9);
const leftHeaders = new Array(9);
const dataCells = [];

function makeDiv(cls, txt=""){
  const d = document.createElement("div");
  d.className = cls;
  if(txt !== "") d.textContent = txt;
  return d;
}

// row 0: corner + top headers
matrixEl.appendChild(makeDiv("hcell corner", "×"));
for(let col=1; col<=9; col++){
  const h = makeDiv("hcell topHead blank", "");
  topHeaders[col-1] = h;
  matrixEl.appendChild(h);
}

// rows 1..9: left headers (keep box) + data
for(let row=1; row<=9; row++){
  const h = makeDiv("hcell leftHead blank", "");
  leftHeaders[row-1] = h;
  matrixEl.appendChild(h);

  for(let col=1; col<=9; col++){
    const el = makeDiv("cell");
    const t = makeDiv("t");
    el.appendChild(t);
    matrixEl.appendChild(el);
    dataCells.push({a:col, b:row, el, t});
  }
}

function idxOf(a,b){ return (b-1)*9 + (a-1); }

function clearCellStates(){
  for(const c of dataCells){
    c.el.classList.remove("active","correct","wrong");
    if(completed[c.b] && completed[c.b][c.a]){
      c.el.classList.add("done");
      // text kept as-is (should be full equation)
    }else{
      c.el.classList.remove("done");
      c.t.textContent = "";
    }
  }
}

function setHeaders(a,b){
  for(let i=0;i<9;i++){
    const el = topHeaders[i];
    if(i === a-1){
      el.textContent = String(a);
      el.classList.remove("blank");
    }else{
      el.textContent = "";
      el.classList.add("blank");
    }
  }
  for(let i=0;i<9;i++){
    const el = leftHeaders[i];
    if(i === b-1){
      el.textContent = String(b);
      el.classList.remove("blank");
    }else{
      el.textContent = "";
      el.classList.add("blank");
    }
  }
}

function setHeadersAll(){
  for(let i=0;i<9;i++){
    const a = i+1;
    const el = topHeaders[i];
    el.textContent = String(a);
    el.classList.remove('blank');
  }
  for(let i=0;i<9;i++){
    const b = i+1;
    const el = leftHeaders[i];
    el.textContent = String(b);
    el.classList.remove('blank');
  }
}

function setGuides(a,b){
  const col = a + 1; // header offset
  const row = b + 1;

  // active cell top-left
  const x0 = OFFSET + (col-1)*CELL + (col-1)*GAP;
  const y0 = OFFSET + (row-1)*CELL + (row-1)*GAP;

  // column/row centers (for line alignment)
  const cx = x0 + CELL/2;
  const cy = y0 + CELL/2;

  // data area starts after the header row/col
  const dataTop  = OFFSET + CELL;
  const dataLeft = OFFSET + CELL;

  // 只显示在“红线范围”内：
  // - 竖线：从数据区顶部(dataTop)到交点格子顶部(y0)
  // - 横线：从数据区左侧(dataLeft)到交点格子左侧(x0)
  guideVEl.style.display = "block";
  guideVEl.style.left = `${cx}px`;
  guideVEl.style.top = `${dataTop}px`;
  guideVEl.style.height = `${Math.max(0, y0 - dataTop)}px`;

  guideHEl.style.display = "block";
  guideHEl.style.top = `${cy}px`;
  guideHEl.style.left = `${dataLeft}px`;
  guideHEl.style.width = `${Math.max(0, x0 - dataLeft)}px`;
}

let deck = buildDeck81();
let completed = Array.from({length:10}, ()=>Array(10).fill(false));
let active = {a:1,b:1,ans:1,idx:0};
let userInput = "";
let progress = 0; // 已完成(答对并移出队列)数量

let qStart = 0;
let raf = null;

function flashOk(){
  flashBadEl.classList.remove("on");
  flashOkEl.classList.add("on");
  setTimeout(()=>flashOkEl.classList.remove("on"), 160);
}
function flashBad(){
  flashOkEl.classList.remove("on");
  flashBadEl.classList.add("on");
  setTimeout(()=>flashBadEl.classList.remove("on"), 220);
}

function setProgress(p){
  progress = Math.max(0, Math.min(MAX_PROGRESS, p));
  const r = progress / MAX_PROGRESS;
  scoreTextEl.textContent = `${progress}/${MAX_PROGRESS}`;
  progFillEl.style.width = `${(r*100).toFixed(1)}%`;

  // 冰淇淋填充：随进度从下往上（更明显的颜色）
  if(iceFillEl){
    iceFillEl.style.height = `${(r*100).toFixed(1)}%`;
  }
}

function setInput(s){
  userInput = s;
  inputValueEl.textContent = userInput || " ";

  // show typed digits after '=' inside the active cell
  try{
    const c = dataCells[active.idx];
    if(c && c.t && c.el && c.el.classList.contains("active")){
      c.t.textContent = userInput ? `${active.a}×${active.b}=${userInput}` : `${active.a}×${active.b}=`;
    }
  }catch(e){}
}

function setActive(a,b){
  clearCellStates();
  setHeaders(a,b);

  const idx = idxOf(a,b);
  const cell = dataCells[idx];
  cell.el.classList.add("active");
  cell.el.classList.remove("done");
  cell.t.textContent = `${a}×${b}=`;
  active = {a,b,ans:a*b,idx};

  setGuides(a,b);
}

/* timer */
function stopTimer(){
  if(raf) cancelAnimationFrame(raf);
  raf = null;
}
function fmtMMSS(msLeft){
  const s = Math.ceil(msLeft/1000);
  const mm = String(Math.floor(s/60)).padStart(2,"0");
  const ss = String(s%60).padStart(2,"0");
  return `${mm}:${ss}`;
}
function startTimer(){
  stopTimer();
  qStart = nowMs();
  const tick = ()=>{
    const used = nowMs() - qStart;
    const left = Math.max(0, QUESTION_TIME_MS - used);
    const ratio = left / QUESTION_TIME_MS;
    timeFillEl.style.width = `${(ratio*100).toFixed(2)}%`;
    timeDigitalEl.textContent = fmtMMSS(left);
    if(left <= 0){ onTimeout(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

/* keypad */
const layout = ["1","2","3","4","5","6","7","8","9","0","⌫","clear"];
function buildKeypad(){
  keypadEl.innerHTML = "";
  for(const k of layout){
    const btn = document.createElement("button");
    btn.className = "key";
	if(k===""){
	  btn.classList.add("empty");
	  btn.disabled = true;
	}else if(k==="clear"){
	  btn.textContent = "clear";
	  btn.classList.add("clearKey");
	  btn.addEventListener("click", ()=>{
        deck = buildDeck81();
        completed = Array.from({length:10}, ()=>Array(10).fill(false));
        for(const c of dataCells){ c.el.classList.remove("done","active","correct","wrong"); c.t.textContent=""; }
        setProgress(0);
        newQuestion();
      });
	}else{
	  btn.textContent = k;
	  btn.addEventListener("click", ()=>onKey(k));
	}
    keypadEl.appendChild(btn);
  }
}
buildKeypad();

function setKeypadLocked(lock){
  keypadEl.querySelectorAll(".key").forEach(k=>{
    if(k.classList.contains("empty")) return;
    k.classList.toggle("disabled", lock);
  });
}

/* flow */
function mark(correct){
  const cell = dataCells[active.idx];
  cell.el.classList.remove("correct","wrong");
  cell.el.classList.add(correct ? "correct" : "wrong");
}

function newQuestion(){
  // 完成：81题都答对（队列清空）后暂停
  if(progress >= MAX_PROGRESS || deck.length === 0){
    stopTimer();
    setKeypadLocked(true);
    scoreTextEl.textContent = `${MAX_PROGRESS}/${MAX_PROGRESS}`;
    timeDigitalEl.textContent = "DONE";
    timeFillEl.style.width = "0%";

    // 完成后：显示完整表头（1-9）
    try{ setHeadersAll(); }catch(e){}
    // 完成后：隐藏引导虚线，避免干扰
    guideVEl.style.display = "none";
    guideHEl.style.display = "none";

    // 保持当前画面，不再出题
    return;
  }
  setKeypadLocked(false);

  // 取队首（按难度排序，且会在答错/超时后被旋转到队尾）
  const q = deck[0];
  setActive(q.a, q.b);

  // clear input for this question (do not touch previous completed cells)
  setInput("");

  const cell = dataCells[active.idx];
  cell.el.classList.remove("correct","wrong");

  startTimer();
}



function onKey(k){
  if(k==="⌫"){
    if(userInput.length>0) setInput(userInput.slice(0,-1));
    return;
  }
  if(userInput.length>=2) return;
  setInput(userInput + k);
  evaluate();
}

function evaluate(){
  const val = parseInt(userInput, 10);
  if(Number.isNaN(val)) return;

  if(val === active.ans){
    stopTimer();
    setKeypadLocked(true);
    flashOk();
    mark(true);

    // 本题完成：标记完成（在矩阵中常驻显示完整算式）
    completed[active.b][active.a] = true;

    // 本题完成：移出队首，进度+1
    if(deck.length>0) deck.shift();
    setProgress(progress + 1);

    // 显示正确答案0.2s后切下一题
    const cell = dataCells[active.idx];
    cell.t.textContent = `${active.a}×${active.b}=${active.ans}`;
    cell.el.classList.add("done");
    setTimeout(()=>newQuestion(), 200);
    return;
  }
  const ansLen = active.ans >= 10 ? 2 : 1;
  if(userInput.length >= ansLen){
    stopTimer();
    setKeypadLocked(true);
    flashBad();
    mark(false);
    const cell = dataCells[active.idx];
    cell.el.classList.add('flash-red');
    setTimeout(()=>cell.el.classList.remove('flash-red'), 300);
    cell.t.textContent = `${active.a}×${active.b}=${active.ans}`;

    // 本题未完成：放到队尾（稍后再考）
    if(deck.length>0) deck.push(deck.shift());
    setTimeout(()=>newQuestion(), 1000);
  }
}

/* init */
deck = buildDeck81();
completed = Array.from({length:10}, ()=>Array(10).fill(false));
setProgress(0);
setHeaders(1,1);
timeDigitalEl.textContent = "00:10";
newQuestion();
