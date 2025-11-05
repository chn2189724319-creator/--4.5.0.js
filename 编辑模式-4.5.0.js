// ==UserScript==
// @name        编辑模式
// @namespace    http://tampermonkey.net/
// @version      4.5.0
// @description  编辑模式工具
// @match        *://xgxt.huhst.edu.cn/ydxg/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';
  if (!location.href.includes('xgxt.huhst.edu.cn/ydxg')) return;

  let isEditable = false;
  let isHidden = false;
  let hiddenArea = null;
  let teardownKeyHandler = null;
  let mo = null;
  let toastTimer = null;

  // 延迟任务句柄（用于在关闭时统一清理）
  let injectTimers = { scan: null, replace: null, protect: null };

  // 总闸：仅在编辑模式下允许注入
  let allowInjectControls = false;

  // ====== 样式（按钮美化，沿用视觉方案） ======
  const style = document.createElement('style');
  style.textContent = `
    :root {
      --btn-radius: 14px;
      --btn-font: ui-sans-serif, -apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji","Segoe UI Emoji";
      --shadow-1: 0 8px 20px rgba(0,0,0,.18), 0 2px 8px rgba(0,0,0,.08);
      --shadow-2: 0 10px 28px rgba(0,0,0,.22), 0 3px 10px rgba(0,0,0,.12);
      --glass-bg: linear-gradient(135deg, rgba(255,255,255,.25), rgba(255,255,255,.08));
      --glass-border: rgba(255,255,255,.35);
      --ring: 0 0 0 3px rgba(56, 189, 248, .45);
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --glass-bg: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.06));
        --glass-border: rgba(255,255,255,.22);
        --ring: 0 0 0 3px rgba(125, 211, 252, .45);
      }
    }
    #editModeBtn, #hideBtn {
      position: fixed;
      right: 20px;
      z-index: 99999;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      border: 1px solid var(--glass-border);
      border-radius: var(--btn-radius);
      font: 600 14px/1 var(--btn-font);
      color: #fff;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: transform .2s ease, box-shadow .2s ease, filter .2s ease, opacity .2s ease;
      box-shadow: var(--shadow-1);
      backdrop-filter: blur(8px) saturate(120%);
      -webkit-backdrop-filter: blur(8px) saturate(120%);
      text-shadow: 0 1px 1px rgba(0,0,0,.3);
      overflow: hidden;
      isolation: isolate;
    }
    #editModeBtn { top: 20px; background: linear-gradient(135deg,#0ea5e9,#2563eb); }
    #hideBtn { top: 72px; background: linear-gradient(135deg,#6b7280,#4b5563); }
    #editModeBtn:hover, #hideBtn:hover { transform: translateY(-2px); box-shadow: var(--shadow-2); filter: brightness(1.05); }
    #editModeBtn:active, #hideBtn:active { transform: translateY(0); filter: brightness(.95); }
    #editModeBtn:focus-visible, #hideBtn:focus-visible { outline: none; box-shadow: var(--shadow-2), var(--ring); }
    .btn-ripple {
      position: absolute; border-radius: 50%; transform: translate(-50%, -50%); pointer-events: none;
      width: 10px; height: 10px; opacity: .45; background: rgba(255,255,255,.9); animation: ripple .6s ease-out forwards; mix-blend-mode: screen;
    }
    @keyframes ripple { from { width: 10px; height: 10px; opacity: .45; } to { width: 320px; height: 320px; opacity: 0; } }
    .quick-edit-btn {
      background: linear-gradient(135deg,#0ea5e9,#2563eb); color: white; border: 0; border-radius: 10px;
      margin-left: 8px; padding: 6px 12px; font: 600 13px/1 var(--btn-font); cursor: pointer;
      transition: transform .15s ease, box-shadow .15s ease, filter .15s ease; box-shadow: 0 4px 12px rgba(0,0,0,.14);
    }
    .quick-edit-btn:hover { transform: translateY(-1px); filter: brightness(1.05); }
    .quick-edit-btn:active { transform: translateY(0); filter: brightness(.95); }
    .leave-duration-input {
      width: 120px; margin-left: 10px; padding: 7px 9px; border: 1px solid #d1d5db; border-radius: 10px;
      font: 500 13px/1 var(--btn-font); background: var(--glass-bg); color: inherit; outline: none;
      transition: box-shadow .15s ease, border-color .15s ease; backdrop-filter: blur(6px);
    }
    .leave-duration-input:focus { border-color: #38bdf8; box-shadow: var(--ring); }
    .small-toast {
      position: fixed; right: 20px; bottom: 20px; z-index: 999999; background: rgba(17,24,39,.92); color: white;
      padding: 10px 14px; border-radius: 12px; font: 600 13px/1 var(--btn-font); box-shadow: var(--shadow-1); border: 1px solid rgba(255,255,255,.08);
    }
    .is-editing { background: linear-gradient(135deg,#ef4444,#dc2626) !important; animation: pulse-once .7s ease-out 1; }
    @keyframes pulse-once { 0% { transform: translateY(-2px) scale(1.02); } 100% { transform: translateY(0) scale(1); } }
  `;
  document.head.appendChild(style);

  // ====== 控制按钮 ======
  const editBtn = document.createElement('button');
  editBtn.id = 'editModeBtn';
  editBtn.setAttribute('contenteditable', 'false');
  editBtn.setAttribute('aria-label', '切换编辑模式');
  editBtn.innerHTML = '🛠️ <span>开启编辑模式</span>';

  const hideBtn = document.createElement('button');
  hideBtn.id = 'hideBtn';
  hideBtn.setAttribute('contenteditable', 'false');
  hideBtn.setAttribute('aria-label', '隐藏按钮');
  hideBtn.innerHTML = '🙈 <span>隐藏</span>';

  document.body.appendChild(editBtn);
  document.body.appendChild(hideBtn);

  // 涟漪效果
  function attachRipple(el) {
    el.addEventListener('click', (e) => {
      const rect = el.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'btn-ripple';
      ripple.style.left = (e.clientX - rect.left) + 'px';
      ripple.style.top  = (e.clientY - rect.top) + 'px';
      el.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    }, { passive: true });
  }
  attachRipple(editBtn);
  attachRipple(hideBtn);

  editBtn.addEventListener('click', e => { e.stopPropagation(); toggleEditMode(); });
  hideBtn.addEventListener('click', e => { e.stopPropagation(); toggleButtons(); });

  function toggleButtons() {
    isHidden = !isHidden;
    const v = isHidden ? '0' : '1';
    const pe = isHidden ? 'none' : 'auto';
    editBtn.style.opacity = v; editBtn.style.pointerEvents = pe;
    hideBtn.style.opacity = v; hideBtn.style.pointerEvents = pe;
    if (isHidden) createHiddenArea(); else removeHiddenArea();
  }
  function createHiddenArea() {
    if (hiddenArea) return;
    hiddenArea = document.createElement('div');
    Object.assign(hiddenArea.style, {
      position: 'fixed', right: '0', top: '0',
      width: '150px', height: '150px', zIndex: '99998', opacity: '0',
      cursor: 'pointer'
    });
    hiddenArea.addEventListener('click', (e) => { e.stopPropagation(); toggleButtons(); });
    document.body.appendChild(hiddenArea);
  }
  function removeHiddenArea() { if (hiddenArea) { hiddenArea.remove(); hiddenArea = null; } }

  // ====== 编辑模式开关 ======
  function toggleEditMode() {
    const willClose = isEditable === true; // 记录是否从开->关

    if (willClose) {
      // 先停观察与延迟任务，防止“清理”触发新的回调或延迟注入
      stopObserver();
      cancelInjectTimers();
      allowInjectControls = false;
      removeLeaveControlsAndToasts(); // 预清理一次
    }

    isEditable = !isEditable;
    document.body.contentEditable = String(isEditable);
    editBtn.querySelector('span').textContent = isEditable ? '关闭编辑模式' : '开启编辑模式';
    editBtn.classList.toggle('is-editing', isEditable);
    [editBtn, hideBtn, hiddenArea].forEach(el => el && el.setAttribute('contenteditable', 'false'));

    if (isEditable) {
      allowInjectControls = true;
      replaceReviewStatus();
      protectLabelsAndWrapValues();
      attachBoundaryDeleteGuards();
      scanAndInjectQuickTimeControls();
      updateProcessStepTimes();
      startObserver();
    } else {
      // 兜底清理（确保没有残留）
      detachBoundaryDeleteGuards();
      removeLeaveControlsAndToasts();
    }
  }

  // ====== 替换审核状态 ======
  function replaceReviewStatus() {
    document.querySelectorAll('span').forEach(span => {
      if (span.textContent && span.textContent.trim() === '审核不通过') {
        span.textContent = '审核通过';
        span.style.color = 'rgb(50, 223, 114)';
        span.style.marginLeft = '8px';
        span.style.fontWeight = '550';
      }
    });
  }

  // ====== 保护标签 & 包装可编辑字段 ======
  function protectLabelsAndWrapValues() {
    const labels = document.querySelectorAll('font[color="grey"]:not([data-protected-label])');
    labels.forEach(label => {
      label.setAttribute('data-protected-label', '');
      label.setAttribute('contenteditable', 'false');
    });
  }

  // ====== 防跨边界删除（简化） ======
  function attachBoundaryDeleteGuards() {
    const onKeyDown = (e) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return;
      const field = findAncestor(sel.anchorNode, n => n.nodeType === 1 && n.hasAttribute?.('data-editable-field'));
      if (!field) return;
      const pos = caretPositionWithin(field);
      if (e.key === 'Backspace' && pos.atStart) {
        const prev = previousMeaningfulSibling(field);
        if (prev && prev.hasAttribute('data-protected-label')) e.preventDefault();
      }
      if (e.key === 'Delete' && pos.atEnd) {
        const next = nextMeaningfulSibling(field);
        if (next && (next.hasAttribute?.('data-protected-label') || next.hasAttribute?.('data-editable-field')))
          e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    teardownKeyHandler = () => document.removeEventListener('keydown', onKeyDown, true);
  }
  function detachBoundaryDeleteGuards() { if (teardownKeyHandler) { teardownKeyHandler(); teardownKeyHandler = null; } }

  // ====== 时间 / DOM 帮助函数 ======
  function formatDate(d) {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function addMinutes(date, mins) { return new Date(date.getTime() + mins * 60000); }

  function findTimeValueNodeForFont(fontEl) {
    const container = fontEl.closest('div') || fontEl.parentNode;
    if (container) {
      const v1 = container.querySelector('.oneOnOneViewText');
      if (v1) return v1;
      const v2 = container.querySelector('.step_time___1Qq-E');
      if (v2) return v2;
      let sibling = fontEl.nextSibling;
      while (sibling) {
        if (sibling.nodeType === Node.TEXT_NODE && sibling.nodeValue.trim()) return sibling;
        if (sibling.nodeType === Node.ELEMENT_NODE && (sibling.matches('span') || sibling.matches('div'))) return sibling;
        sibling = sibling.nextSibling;
      }
    }
    const fallback = document.querySelector('.oneOnOneViewText, .step_time___1Qq-E');
    return fallback || null;
  }

  // ====== 注入 / 移除 请假时间控件 ======
  function scanAndInjectQuickTimeControls() {
    // 非编辑模式或开关关闭时，强制不注入（对抗延迟任务回流）
    if (!isEditable || !allowInjectControls) return;

    removeQuickTimeControls(); // 先清一次，避免重复
    document.querySelectorAll('font[color="grey"]').forEach(fontEl => {
      const txt = (fontEl.textContent || '').trim();
      if (txt.includes('请假开始时间')) {
        const container = fontEl.closest('div') || fontEl.parentNode;
        if (!container) return;
        if (container.querySelector('.quick-edit-btn') || container.querySelector('.leave-duration-input')) return;

        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.5';
        input.placeholder = '请假时长(h)';
        input.className = 'leave-duration-input';
        input.setAttribute('contenteditable', 'false');

        const btn = document.createElement('button');
        btn.className = 'quick-edit-btn';
        btn.textContent = '修改';
        btn.setAttribute('contenteditable', 'false');

        btn.addEventListener('click', (ev) => {
          ev.preventDefault(); ev.stopPropagation();
          const duration = parseFloat(input.value);
          if (isNaN(duration) || duration <= 0) { showToast('请输入请假时长（小时）', 2000); return; }

          const now = new Date();
          now.setMinutes(now.getMinutes() - 20);
          const rounded = Math.round(now.getMinutes() / 10) * 10;
          now.setMinutes(rounded); now.setSeconds(0);
          const startStr = formatDate(now);
          const end = new Date(now.getTime() + duration * 3600 * 1000);
          const endStr = formatDate(end);

          const startNode = findTimeValueNodeForFont(fontEl);
          if (startNode) {
            if (startNode.nodeType === Node.TEXT_NODE) startNode.textContent = ' ' + startStr + ' ';
            else startNode.textContent = startStr;
          }

          const endFont = Array.from(document.querySelectorAll('font[color="grey"]')).find(f => (f.textContent||'').includes('请假结束时间'));
          if (endFont) {
            const endNode = findTimeValueNodeForFont(endFont);
            if (endNode) {
              if (endNode.nodeType === Node.TEXT_NODE) endNode.textContent = ' ' + endStr + ' ';
              else endNode.textContent = endStr;
            }
          }

          const durFont = Array.from(document.querySelectorAll('font[color="grey"]')).find(f => (f.textContent || '').includes('请假时长天'));
    if (durFont) {
        const durNode = findTimeValueNodeForFont(durFont);
        if (durNode) {
            const days = Math.floor(duration / 24); // Calculate days
            const hours = Math.floor(duration % 24); // Calculate hours
            const minutes = Math.round((duration % 1) * 60); // Calculate minutes

            const text = `${days}天 ${hours}小时 ${minutes}分钟`;
            if (durNode.nodeType === Node.TEXT_NODE) durNode.textContent = ' ' + text + ' ';
            else durNode.textContent = text;
            }
          }

          showToast('请假时间已更新', 1200);
          updateProcessStepTimes();
          removeQuickTimeControls();
          if (isEditable) toggleEditMode();
          if (!isHidden) toggleButtons();
        });

        container.appendChild(input);
        container.appendChild(btn);
      }
    });
  }
  function removeQuickTimeControls() {
    document.querySelectorAll('.leave-duration-input, .quick-edit-btn').forEach(n => n.remove());
  }
  function removeLeaveControlsAndToasts() {
    removeQuickTimeControls();
    const toast = document.querySelector('.small-toast');
    if (toast) toast.remove();
    if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  }

  // ====== MutationObserver（动态渲染） ======
  function startObserver() {
    if (mo) return;
    mo = new MutationObserver(muts => {
      if (!isEditable) return;
      let shouldScan = false;
      for (const m of muts) { if (m.addedNodes && m.addedNodes.length) { shouldScan = true; break; } }
      if (shouldScan) {
        // 取消上次未执行的延迟任务，避免堆积
        cancelInjectTimers();
        injectTimers.scan    = setTimeout(scanAndInjectQuickTimeControls, 200);
        injectTimers.replace = setTimeout(replaceReviewStatus, 200);
        injectTimers.protect = setTimeout(protectLabelsAndWrapValues, 200);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  function stopObserver() { if (mo) { mo.disconnect(); mo = null; } }
  function cancelInjectTimers() {
    Object.values(injectTimers).forEach(id => id && clearTimeout(id));
    injectTimers = { scan: null, replace: null, protect: null };
  }

  // ====== 小提示 ======
  function showToast(txt, ms = 1500) {
    let el = document.querySelector('.small-toast');
    if (!el) { el = document.createElement('div'); el.className = 'small-toast'; document.body.appendChild(el); }
    el.textContent = txt;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.remove(); toastTimer = null; }, ms);
  }

  // ====== 更新流程（办理进度）时间逻辑 ======
  function updateProcessStepTimes() {
    const stepItems = Array.from(document.querySelectorAll('.am-steps-item, .am-steps-item-custom'));
    if (!stepItems.length) return;

    const mapping = {};
    stepItems.forEach(it => {
      const titleEl = it.querySelector('.step_title___3yKU2') || it.querySelector('.am-steps-item-title') || it;
      const timeEl = it.querySelector('.step_time___1Qq-E') || it.querySelector('.am-steps-item-time') || it.querySelector('div[title]');
      const titleText = titleEl ? (titleEl.textContent || '').trim() : '';
      if (!titleText) return;
      if (titleText.includes('申请')) mapping.apply = timeEl;
      else if (titleText.includes('班主任')) mapping.teacher = timeEl;
      else if (titleText.includes('辅导员')) mapping.counselor = timeEl;
    });

    const now = new Date();
    const hour = now.getHours();
    let applyBase;
    if (hour >= 22) {
      applyBase = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0, 0);
    } else if (hour < 8) {
      const y = new Date(now.getTime() - 24 * 3600 * 1000);
      applyBase = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 21, 0, 0, 0);
    } else {
      applyBase = new Date(now.getTime() - 2 * 3600 * 1000);
    }

    let applyOffsetMins;
    if (hour >= 22 || hour < 8) {
      applyOffsetMins = Math.round((Math.random() * 61) - 30);
    } else {
      applyOffsetMins = Math.round((Math.random() * 21) - 10);
    }
    applyBase = addMinutes(applyBase, applyOffsetMins);
    const roundedApply = new Date(applyBase.getTime());
    const m = Math.round(roundedApply.getMinutes() / 10) * 10;
    roundedApply.setMinutes(m);
    roundedApply.setSeconds(0);

    const teacherOffset = 30 + Math.floor(Math.random() * 31);
    const teacherTime = addMinutes(roundedApply, teacherOffset);
    const counselorOffset = 10 + Math.floor(Math.random() * 41);
    const counselorTime = addMinutes(teacherTime, counselorOffset);

    if (mapping.apply && mapping.apply.textContent !== undefined) mapping.apply.textContent = formatDate(roundedApply);
    if (mapping.teacher && mapping.teacher.textContent !== undefined) mapping.teacher.textContent = formatDate(teacherTime);
    if (mapping.counselor && mapping.counselor.textContent !== undefined) mapping.counselor.textContent = formatDate(counselorTime);

    showToast('办理进度时间已智能更新', 1200);
  }

  // ====== 简单 DOM 帮助函数（复用） ======
  function findAncestor(node, predicate) {
    let n = node;
    while (n) { if (predicate(n)) return n; n = n.parentNode; }
    return null;
  }
  function caretPositionWithin(field) {
    const sel = window.getSelection();
    const cur = sel.getRangeAt(0).cloneRange();
    const startRange = document.createRange(); startRange.selectNodeContents(field); startRange.collapse(true);
    const endRange = document.createRange(); endRange.selectNodeContents(field); endRange.collapse(false);
    const atStart = cur.compareBoundaryPoints(Range.START_TO_START, startRange) === 0;
    const atEnd = cur.compareBoundaryPoints(Range.END_TO_END, endRange) === 0;
    return { atStart, atEnd };
  }
  function previousMeaningfulSibling(el) {
    let n = el.previousSibling;
    while (n && n.nodeType === 3 && !n.nodeValue.trim()) n = n.previousSibling;
    return n;
  }
  function nextMeaningfulSibling(el) {
    let n = el.nextSibling;
    while (n && n.nodeType === 3 && !n.nodeValue.trim()) n = n.nextSibling;
    return n;
  }

  // ====== 启动（默认不自动开启） ======
  // isEditable = true; toggleEditMode(); // 取消注释可自动开启
})();
