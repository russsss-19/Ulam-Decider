// =============================================
// ULAM DECIDER — app.js
// 3-Step AI Workflow:
//  1. Gather ingredients (photo vision OR text)
//  2. AI decides the dish (Gemini)
//  3. Output full recipe in Nanay voice
// =============================================

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

// ---- STATE ----
let photoBase64 = null;
let photoMime = 'image/jpeg';
let currentMode = 'photo';
let result = null; // Full AI output

// ==========================================
// INIT
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('ulam_gemini_key');
  if (saved) document.getElementById('gemini-key').value = saved;

  initUploadZone();
});

// ==========================================
// MODE SWITCHING
// ==========================================
function switchMode(mode) {
  currentMode = mode;
  document.getElementById('photo-mode').classList.toggle('hidden', mode !== 'photo');
  document.getElementById('text-mode').classList.toggle('hidden', mode !== 'text');
  document.getElementById('mode-photo').classList.toggle('active', mode === 'photo');
  document.getElementById('mode-text').classList.toggle('active', mode !== 'photo');
}

// ==========================================
// UPLOAD ZONE
// ==========================================
function initUploadZone() {
  const zone = document.getElementById('upload-zone');
  const fileInput = document.getElementById('file-input');

  zone.addEventListener('click', () => fileInput.click());

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelect(file);
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) handleFileSelect(e.target.files[0]);
  });
}

function handleFileSelect(file) {
  photoMime = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    photoBase64 = dataUrl.split(',')[1];

    document.getElementById('preview-img').src = dataUrl;
    document.getElementById('upload-zone').classList.add('hidden');
    document.getElementById('preview-wrap').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  photoBase64 = null;
  document.getElementById('preview-img').src = '';
  document.getElementById('preview-wrap').classList.add('hidden');
  document.getElementById('upload-zone').classList.remove('hidden');
  document.getElementById('file-input').value = '';
}

// ==========================================
// QUICK TAG
// ==========================================
function addTag(ingredient) {
  const ta = document.getElementById('ingredients-text');
  const cur = ta.value.trim();
  ta.value = cur ? `${cur}, ${ingredient}` : ingredient;
  ta.focus();
}

// ==========================================
// MAIN WORKFLOW
// ==========================================
async function runDecider() {
  const apiKey = document.getElementById('gemini-key').value.trim();
  if (!apiKey) {
    showError('Hala! Walang Gemini API Key. Ilagay mo muna! 🙏');
    return;
  }
  localStorage.setItem('ulam_gemini_key', apiKey);
  hideError();

  // Validate input
  if (currentMode === 'photo' && !photoBase64) {
    showError('Walang litrato ng ref! Mag-upload ka muna o lumipat sa text mode. 📷');
    return;
  }
  if (currentMode === 'text' && !document.getElementById('ingredients-text').value.trim()) {
    showError('Walang sangkap na nalagay! Isulat mo kung anong meron ka sa bahay. ✍️');
    return;
  }

  // Disable button
  const btn = document.getElementById('decide-btn');
  btn.disabled = true;
  document.getElementById('decide-btn-text').textContent = 'Pinagdedebatian ng Nanay AI...';

  const budget = document.getElementById('budget-select').value;
  const serving = document.getElementById('serving-select').value;
  const vibe = document.getElementById('vibe-select').value;

  // Show step 2
  const step2 = document.getElementById('step2');
  step2.classList.remove('hidden');
  step2.classList.add('active');
  step2.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    // ---- STEP 1→2: Identify ingredients ----
    let ingredients = [];
    if (currentMode === 'photo') {
      updateThinkStatus('Tinitingnan ang litrato ng ref mo...');
      ingredients = await identifyIngredientsFromPhoto(apiKey);
    } else {
      updateThinkStatus('Binabasa ang mga sangkap mo...');
      const raw = document.getElementById('ingredients-text').value.trim();
      ingredients = raw.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    }

    // Show ingredient chips
    showIngredientChips(ingredients);
    await sleep(600);

    // ---- STEP 2: AI decides the dish ----
    updateThinkStatus('Pinipili ang perpektong ulam para sa iyo...');
    await sleep(400);
    const aiOutput = await decideUlam(apiKey, ingredients, budget, serving, vibe);
    result = aiOutput;

    // Show dish decision
    document.getElementById('dish-name-big').textContent = aiOutput.dishName;
    document.getElementById('dish-why').textContent = aiOutput.whyThisDish;
    document.getElementById('decision-reveal').classList.remove('hidden');
    document.getElementById('s2-status').textContent = '✅';
    step2.classList.remove('active');
    step2.classList.add('done');
    await sleep(700);

    // ---- STEP 3: Render recipe ----
    renderRecipe(aiOutput, ingredients);

  } catch (err) {
    showError(`May nangyaring error: ${err.message}`);
    console.error(err);
  } finally {
    btn.disabled = false;
    document.getElementById('decide-btn-text').textContent = 'Hayaan ang Nanay AI Mag-Decide!';
  }
}

// ==========================================
// STEP 1A: VISION — Identify from photo
// ==========================================
async function identifyIngredientsFromPhoto(apiKey) {
  const prompt = `Ikaw ay isang expert Filipino cook. Tingnan ang larawang ito ng ref o pantry at ilista ang lahat ng makikitang ingredients o pagkain. 

I-format ang iyong sagot bilang isang simpleng comma-separated list ng mga ingredients sa Taglish. Halimbawa: "manok, kamatis, sibuyas, bawang, toyo, itlog, talong"

Huwag maglagay ng iba pang salita — listahan lang ng mga ingredients. Kung walang makitang ingredients, sabihing "walang makita".`;

  const parts = [
    { text: prompt },
    { inline_data: { mime_type: photoMime, data: photoBase64 } }
  ];

  const data = await callGemini(apiKey, parts);
  const text = data.trim().toLowerCase();
  if (text.includes('walang makita') || text.length < 3) return ['hindi malinaw ang litrato'];
  return text.split(',').map(s => s.trim()).filter(Boolean);
}

// ==========================================
// STEP 2: Decide the dish
// ==========================================
async function decideUlam(apiKey, ingredients, budget, serving, vibe) {
  const day = new Date().toLocaleDateString('en-PH', { weekday: 'long' });
  const time = new Date().getHours();
  const mealTime = time < 10 ? 'almusal' : time < 14 ? 'tanghalian' : time < 18 ? 'merienda' : 'hapunan';

  const budgetMap = { tipid: '₱50-150', normal: '₱150-400', splurge: '₱400+' };
  const vibeMap = {
    auto: 'Kahit ano — bahala ang AI',
    sabaw: 'May sabaw — comfort food, mainit',
    prito: 'Prito o nilaga — simple lang',
    special: 'Espesyal — may okasyon kasi',
  };

  const prompt = `Ikaw ay si Nanay AI — isang matandang marunong magluto na Filipino Nanay na may sense of humor. Nagsasalita ka sa Taglish.

Mga available na sangkap: ${ingredients.join(', ')}
Araw ngayon: ${day}
Oras: Para sa ${mealTime}
Budget: ${budgetMap[budget]}
Para sa: ${serving} na tao
Gusto: ${vibeMap[vibe]}

Mag-decide ka ng ISANG Filipino dish na pinaka-angkop. Sagutin mo ito bilang isang JSON object — WALA NANG IBA, JSON LANG:

{
  "dishName": "Pangalan ng ulam",
  "whyThisDish": "Maikling paliwanag kung bakit ito ang pinili (funny at dramatic, 1-2 pangungusap sa Taglish)",
  "nanayQuote": "Isang quote ni Nanay tungkol sa pagluluto nito (funny, sa Taglish, parang totoong Nanay — 2-3 pangungusap)",
  "cookTime": "XX minuto",
  "estimatedCost": "₱XXX",
  "difficulty": "Madali / Katamtaman / Mahirap",
  "ingredientsNeeded": [
    { "name": "sangkap", "amount": "dami", "have": true },
    { "name": "sangkap na kulang", "amount": "dami", "have": false }
  ],
  "steps": [
    { "instruction": "Ano ang gagawin", "nanayTip": "Tip o biro ni Nanay para sa hakbang na ito" }
  ]
}

Siguraduhing:
- Ang "have: true" ay para sa mga sangkap na nasa listahan ng available
- Ang "have: false" ay para sa mga kailangan pang bilhin
- 4-6 steps lang
- Ang nanayTip ay dapat funny at authentic na parang totoong Nanay
- Mag-reference ng Filipino food culture, memes, at struggles kung saan angkop
- Kung Biyernes, mas prefer ang isda/gulay (para sa mga deboto)
- Kung maulap o makulimlim, prefer ang sabaw`;

  const data = await callGemini(apiKey, [{ text: prompt }], 1200);

  // Parse JSON — strip markdown fences if present
  let jsonStr = data.trim();
  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Fallback if Gemini adds prose before/after
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Hindi mabasa ang sagot ng AI. Subukan ulit!');
  }
}

// ==========================================
// STEP 3: Render Recipe
// ==========================================
function renderRecipe(ai, detectedIngredients) {
  const step3 = document.getElementById('step3');
  step3.classList.remove('hidden');
  step3.classList.add('active');
  step3.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Meta chips
  document.getElementById('meta-time').textContent = `⏱️ ${ai.cookTime || '—'}`;
  document.getElementById('meta-cost').textContent = `💰 ${ai.estimatedCost || '—'}`;
  document.getElementById('meta-serving').textContent = `👥 ${document.getElementById('serving-select').value}`;
  document.getElementById('meta-diff').textContent = `🔥 ${ai.difficulty || '—'}`;

  // Nanay quote
  document.getElementById('nanay-quote').textContent = ai.nanayQuote || '—';

  // Ingredient list
  const listEl = document.getElementById('ingredient-list');
  listEl.innerHTML = '';
  const missingItems = [];
  (ai.ingredientsNeeded || []).forEach(ing => {
    const row = document.createElement('div');
    row.className = `ing-row ${ing.have ? 'have' : 'need'}`;
    row.innerHTML = `
      <div class="ing-dot"></div>
      <span class="ing-name">${ing.name}</span>
      <span class="ing-amount">${ing.amount || ''}</span>
    `;
    listEl.appendChild(row);
    if (!ing.have) missingItems.push(ing.name);
  });

  // GrabMart for missing items
  if (missingItems.length > 0) {
    const grabBox = document.getElementById('grab-box');
    const grabLinks = document.getElementById('grab-links');
    grabBox.classList.remove('hidden');
    grabLinks.innerHTML = '';
    missingItems.forEach(item => {
      const encoded = encodeURIComponent(item);
      const a = document.createElement('a');
      a.className = 'grab-link';
      a.href = `https://food.grab.com/ph/en/search?keyword=${encoded}`;
      a.target = '_blank';
      a.textContent = `🛵 ${item}`;
      grabLinks.appendChild(a);
    });
  }

  // Recipe steps
  const stepsEl = document.getElementById('recipe-steps');
  stepsEl.innerHTML = '';
  (ai.steps || []).forEach((step, i) => {
    const li = document.createElement('li');
    li.style.animationDelay = `${i * 0.08}s`;
    li.innerHTML = `
      <span>
        ${step.instruction}
        ${step.nanayTip ? `<em class="step-nanay">👩‍🍳 "${step.nanayTip}"</em>` : ''}
      </span>`;
    stepsEl.appendChild(li);
  });

  // Draw recipe card on canvas
  drawRecipeCard(ai);

  document.getElementById('s3-status').textContent = '✅';
  step3.classList.remove('active');
  step3.classList.add('done');
}

// ==========================================
// CANVAS: Recipe Card
// ==========================================
function drawRecipeCard(ai) {
  const canvas = document.getElementById('recipe-canvas');
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  const W = 640, H = 400;

  // Background
  ctx.fillStyle = '#0c0905';
  ctx.fillRect(0, 0, W, H);

  // Warm glow
  const grd = ctx.createRadialGradient(W * 0.2, H * 0.3, 10, W * 0.2, H * 0.3, 350);
  grd.addColorStop(0, 'rgba(247,169,74,0.1)');
  grd.addColorStop(1, 'transparent');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  // Top stripe
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, '#f7a94a');
  stripe.addColorStop(0.5, '#ff6b35');
  stripe.addColorStop(1, '#e84545');
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, W, 5);

  // Left accent
  ctx.fillStyle = '#f7a94a';
  ctx.fillRect(0, 5, 5, H);

  // Brand
  ctx.fillStyle = 'rgba(240,232,216,0.5)';
  ctx.font = '600 11px Inter, sans-serif';
  ctx.fillText('🍲 ULAM DECIDER — AI-Powered Filipino Food Oracle', 20, 32);

  // Date
  ctx.fillStyle = 'rgba(240,232,216,0.3)';
  ctx.font = '400 11px Inter, sans-serif';
  const now = new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  ctx.fillText(now, 20, 50);

  // Divider
  ctx.strokeStyle = 'rgba(247,169,74,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(20, 62); ctx.lineTo(W - 20, 62); ctx.stroke();

  // Dish name
  ctx.save();
  ctx.fillStyle = '#f7a94a';
  ctx.shadowColor = '#f7a94a';
  ctx.shadowBlur = 20;
  const fontSize = ai.dishName && ai.dishName.length > 16 ? 44 : 60;
  ctx.font = `bold ${fontSize}px "Bebas Neue", Impact, sans-serif`;
  ctx.fillText(ai.dishName || 'ULAM', 20, 130);
  ctx.restore();

  // Why
  ctx.fillStyle = 'rgba(240,232,216,0.6)';
  ctx.font = 'italic 13px Inter, sans-serif';
  wrapText(ctx, ai.whyThisDish || '', 20, 152, W - 40, 18, 2);

  // Divider
  ctx.strokeStyle = 'rgba(247,169,74,0.1)';
  ctx.beginPath(); ctx.moveTo(20, 188); ctx.lineTo(W - 20, 188); ctx.stroke();

  // Meta row
  ctx.fillStyle = 'rgba(240,232,216,0.4)';
  ctx.font = '600 12px Inter, sans-serif';
  ctx.fillText(`⏱️ ${ai.cookTime || '—'}`, 20, 210);
  ctx.fillText(`💰 ${ai.estimatedCost || '—'}`, 170, 210);
  ctx.fillText(`🔥 ${ai.difficulty || '—'}`, 300, 210);

  // Nanay quote box
  ctx.fillStyle = 'rgba(247,169,74,0.07)';
  roundRect(ctx, 20, 224, W - 40, 80, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(247,169,74,0.2)';
  ctx.lineWidth = 1;
  roundRect(ctx, 20, 224, W - 40, 80, 10);
  ctx.stroke();

  ctx.fillStyle = 'rgba(240,232,216,0.75)';
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('👩‍🍳 Sabi ni Nanay:', 36, 246);

  ctx.fillStyle = 'rgba(240,232,216,0.85)';
  ctx.font = 'italic 13px Inter, sans-serif';
  const quote = ai.nanayQuote || '';
  wrapText(ctx, `"${quote}"`, 36, 264, W - 72, 17, 3);

  // Watermark
  ctx.fillStyle = 'rgba(240,232,216,0.2)';
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillText('ulam-decider • Powered by Gemini AI 🇵🇭', 20, H - 16);
}

// ==========================================
// DOWNLOAD
// ==========================================
function downloadRecipeCard() {
  const canvas = document.getElementById('recipe-canvas');
  const name = result?.dishName?.toLowerCase().replace(/\s+/g, '-') || 'ulam';
  const link = document.createElement('a');
  link.download = `ulam-decider-${name}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

// ==========================================
// GEMINI API
// ==========================================
async function callGemini(apiKey, parts, maxTokens = 800) {
  const url = `${GEMINI_BASE}?key=${apiKey}`;
  const body = {
    contents: [{ parts }],
    generationConfig: { temperature: 0.95, maxOutputTokens: maxTokens },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Walang sagot ang Gemini. Baka busy siya sa kainan.');
  return text.trim();
}

// ==========================================
// UI HELPERS
// ==========================================
function showIngredientChips(ingredients) {
  const resultBox = document.getElementById('ingredients-result');
  const chips = document.getElementById('ingredient-chips');
  chips.innerHTML = '';
  ingredients.forEach((ing, i) => {
    const chip = document.createElement('span');
    chip.className = 'ing-chip';
    chip.style.animationDelay = `${i * 0.06}s`;
    chip.textContent = ing;
    chips.appendChild(chip);
  });
  resultBox.classList.remove('hidden');
}

function updateThinkStatus(msg) {
  document.getElementById('think-status').textContent = msg;
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError() {
  document.getElementById('error-msg').classList.add('hidden');
}

// ==========================================
// CANVAS HELPERS
// ==========================================
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 5) {
  const words = text.split(' ');
  let line = '', lines = 0;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
      lines++;
      if (lines >= maxLines) { ctx.fillText(line.trim() + '...', x, y); return; }
    } else { line = test; }
  }
  ctx.fillText(line.trim(), x, y);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
