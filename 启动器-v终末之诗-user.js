// ==UserScript==
// @name         启动器（新）v终末之诗
// @namespace    http://tampermonkey.local/
// @version      1.0.2
// @description  联网自动更新启动器
// @author       匿名
// @match        *://xgxt.huhst.edu.cn/*
// @include      file:///*
// @run-at       document-start
// @grant        none
// @updateURL    https://raw.githubusercontent.com/chn2189724319-creator/jiaotiao/refs/heads/main/%E5%90%AF%E5%8A%A8%E5%99%A8-v%E7%BB%88%E6%9C%AB%E4%B9%8B%E8%AF%97-meta.js
// @downloadURL  https://raw.githubusercontent.com/chn2189724319-creator/jiaotiao/refs/heads/main/%E5%90%AF%E5%8A%A8%E5%99%A8-v%E7%BB%88%E6%9C%AB%E4%B9%8B%E8%AF%97-user.js
// ==/UserScript==

(function(){
  'use strict';

  // === 防止重复注入 ===
  if (window.editModeLoaderInjected) {
    console.log('[loader] 脚本已注入cs，跳过重复执行');
    return;
  }
  window.editModeLoaderInjected = true;
  console.log('[loader] 脚本开始执行');

  /************ 0️⃣ 先手动实现一个 GM_addStyle（关键） ************/

  // 有的环境（或 grant 设置不对）下，GM_addStyle 不存在
  // 我们自己实现一个，功能等价：往 <head> 里塞 <style>
  if (typeof GM_addStyle === 'undefined') {
    window.GM_addStyle = function GM_addStyle(css) {
      const style = document.createElement('style');
      style.setAttribute('type', 'text/css');
      style.textContent = css;
      (document.head || document.documentElement).appendChild(style);
      return style;
    };
  }

  /************ 1️⃣ GM_xmlhttpRequest 兼容实现（XMLHttpRequest 版本，兼容 Safari） ************/

  if (typeof GM_xmlhttpRequest === 'undefined') {
    window.GM_xmlhttpRequest = function GM_xmlhttpRequest(options) {
      const method  = (options.method || 'GET').toUpperCase();
      const url     = options.url;
      const headers = options.headers || {};
      const data    = options.data;
      const timeout = options.timeout || 0;
      const rt      = options.responseType;

      const xhr = new XMLHttpRequest();

      xhr.open(method, url, true);

      // 设置 responseType（部分 Safari 对 arraybuffer / blob 有限制）
      if (rt === 'arraybuffer') {
        try { xhr.responseType = 'arraybuffer'; } catch (e) { /* 忽略 */ }
      } else if (rt === 'blob') {
        try { xhr.responseType = 'blob'; } catch (e) { /* 忽略 */ }
      } else {
        // text / json 保持默认
      }

      // 设置 header
      for (const k in headers) {
        if (Object.prototype.hasOwnProperty.call(headers, k) && headers[k] != null) {
          try {
            xhr.setRequestHeader(k, headers[k]);
          } catch (e) {
            console.warn('setRequestHeader 失败:', k, e);
          }
        }
      }

      // 处理超时
      if (timeout > 0) {
        xhr.timeout = timeout;
        xhr.ontimeout = function () {
          if (typeof options.ontimeout === 'function') {
            try { options.ontimeout(); } catch (e) { console.error(e); }
          }
        };
      }

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;

        const respHeaders = xhr.getAllResponseHeaders() || '';
        const respObj = {
          readyState: 4,
          responseHeaders: respHeaders,
          status: xhr.status,
          statusText: xhr.statusText,
          finalUrl: url,
          responseText: null,
          response: null,
        };

        try {
          if (rt === 'arraybuffer' || rt === 'blob') {
            respObj.response = xhr.response;
          } else {
            const text = xhr.responseText;
            respObj.responseText = text;
            if (rt === 'json') {
              try {
                respObj.response = JSON.parse(text);
              } catch (e) {
                respObj.response = null;
              }
            } else {
              respObj.response = text;
            }
          }
        } catch (e) {
          console.warn('处理响应时异常:', e);
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          if (typeof options.onload === 'function') {
            try { options.onload(respObj); } catch (e) { console.error(e); }
          }
        } else {
          if (typeof options.onerror === 'function') {
            try { options.onerror(respObj); } catch (e) { console.error(e); }
          } else {
            console.error('GM_xmlhttpRequest error status:', xhr.status);
          }
        }
      };

      xhr.onerror = function (err) {
        if (typeof options.onerror === 'function') {
          try { options.onerror(err); } catch (e) { console.error(e); }
        } else {
          console.error('GM_xmlhttpRequest XHR error:', err);
        }
      };

      let bodyToSend = null;
      if (data != null) {
        bodyToSend = data;
        // 如果没设置 Content-Type，默认表单格式
        const hasCT =
          headers['Content-Type'] ||
          headers['content-type'];
        if (!hasCT && typeof data === 'string') {
          try {
            xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
          } catch (e) {}
        }
      }

      xhr.send(bodyToSend);

      return {
        abort: function () {
          try { xhr.abort(); } catch (e) {}
        }
      };
    };
  }

  /************ 2️⃣ 配置 ************/

  // 多镜像源配置 - 主文件（这里指向新的 AES-GCM + Brotli 加密后的 enc.json）
  const remoteEncryptedUrls = [
    'https://raw.githubusercontent.com/chn2189724319-creator/jiaotiao/refs/heads/main/xinjiaotiao.js',
    'https://cdn.jsdelivr.net/gh/chn2189724319-creator/jiaotiao@main/xinjiaotiao.js'
  ];

  // 多镜像源配置 - 口令文件（可选：如果你有远程 pass.txt，可以保留；否则可以清空这个数组）
  const passphraseUrls = [
    'https://raw.githubusercontent.com/chn2189724319-creator/jiaotiao/main/pass.txt',
    'https://cdn.jsdelivr.net/gh/chn2189724319-creator/jiaotiao@main/pass.txt'
  ];

  const STORAGE_KEY = 'editmode_passphrase'; // 本地存储key
  const LOCAL_SCRIPT_CACHE_KEY = '__editmode_cached_script_v3'; // 本地脚本缓存
  const FIXED_PASSPHRASE = null; // 固定口令（留空则禁用）

  /************ 3️⃣ localStorage 安全封装（兼容 Safari 无痕模式） ************/

  function safeGetLocal(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
      console.warn('safeGetLocal 失败:', e);
      return null;
    }
  }

  function safeSetLocal(key, value) {
    try {
      if (!window.localStorage) return;
      if (value === null || value === undefined) {
        window.localStorage.removeItem(key);
      } else {
        window.localStorage.setItem(key, value);
      }
    } catch (e) {
      console.warn('safeSetLocal 失败:', e);
    }
  }

  function saveCachedScript(code) {
    try {
      if (!code || typeof code !== 'string') return;
      safeSetLocal(LOCAL_SCRIPT_CACHE_KEY, JSON.stringify({
        ts: Date.now(),
        code: code
      }));
      console.log('[loader] 已更新本地脚本缓存');
    } catch (e) {
      console.warn('[loader] 保存本地脚本缓存失败:', e);
    }
  }

  function loadCachedScript() {
    try {
      const raw = safeGetLocal(LOCAL_SCRIPT_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.code === 'string' && parsed.code.trim()) {
        return parsed.code;
      }
    } catch (e) {
      console.warn('[loader] 读取本地脚本缓存失败:', e);
    }
    return null;
  }

  function injectCachedScriptIfAvailable() {
    const cached = loadCachedScript();
    if (!cached) return false;
    try {
      console.warn('[loader] 在线资源不可用，已切换到本地缓存脚本');
      injectAndRun(cached);
      return true;
    } catch (e) {
      console.error('[loader] 本地缓存脚本执行失败:', e);
      return false;
    }
  }

  /************ 4️⃣ 工具函数 ************/

  // 这里的 b64ToArrayBuffer / ab2str 目前在 CryptoJS 方案里不一定会用到，但保留也没问题
  function b64ToArrayBuffer(b64){
    if (!b64) return new ArrayBuffer(0);
    b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad === 2) {
      b64 += '==';
    } else if (pad === 3) {
      b64 += '=';
    } else if (pad !== 0) {
      console.warn('b64ToArrayBuffer: base64 长度非法，可能数据损坏');
    }
    let bin;
    try {
      bin = atob(b64);
    } catch (e) {
      console.error('b64ToArrayBuffer: atob 解码失败:', e);
      throw e;
    }
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes.buffer;
  }

  function ab2str(buf){
    return new TextDecoder().decode(new Uint8Array(buf));
  }

  // 检查是否已存在工具栏面板
  function isToolbarPanelExists() {
    return document.getElementById('tm-leave-toolbar-vertical') !== null;
  }

  // 多镜像源并发请求文本
  function fetchTextFromMultiple(urls, timeout = 10000) {
    return new Promise((resolve, reject) => {
      console.log(`[loader] 开始并发请求 ${urls.length} 个镜像源`);
      let completed = 0;
      let hasResolved = false;
      const errors = [];

      urls.forEach((url, index) => {
        const requestId = index + 1;

        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          responseType: 'text',
          timeout: timeout,
          onload: r => {
            completed++;
            if (hasResolved) return;

            if (r.status >= 200 && r.status < 300) {
              console.log(`[loader] 镜像源 ${requestId} 成功 (${completed}/${urls.length})`);
              hasResolved = true;
              resolve(r.responseText);
            } else {
              errors.push(`${url}: HTTP ${r.status}`);
              console.warn(`[loader] 镜像源 ${requestId} HTTP错误: ${r.status}`);
              checkAllCompleted();
            }
          },
          onerror: e => {
            completed++;
            if (hasResolved) return;

            errors.push(`${url}: ${e && e.message ? e.message : '网络错误'}`);
            console.warn(
              `[loader] 镜像源 ${requestId} 网络错误: ${e && e.message ? e.message : '未知错误'}`
            );
            checkAllCompleted();
          },
          ontimeout: () => {
            completed++;
            if (hasResolved) return;

            errors.push(`${url}: 超时`);
            console.warn(`[loader] 镜像源 ${requestId} 超时`);
            checkAllCompleted();
          }
        });
      });

      function checkAllCompleted() {
        if (completed >= urls.length && !hasResolved) {
          console.error('[loader] 所有镜像源均失败:', errors);
          reject(new Error(`所有镜像源均失败: ${errors.join('; ')}`));
        }
      }

      if (urls.length === 0) {
        reject(new Error('镜像源列表为空'));
      }
    });
  }

  // 单 URL 请求文本
  function fetchText(url, timeout = 10000) {
    return new Promise((resolve, reject) => {
      let t = setTimeout(() => reject(new Error('timeout')), timeout);
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        responseType: 'text',
        onload: r => {
          clearTimeout(t);
          r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error('HTTP ' + r.status));
        },
        onerror: e => {
          clearTimeout(t);
          reject(e);
        }
      });
    });
  }

  // 注入并运行主代码
  function injectAndRun(code, asModule=false){
    if (window.editModeMainCodeInjected) {
      console.log('[loader] 主代码已注入，跳过重复执行');
      return;
    }
    window.editModeMainCodeInjected = true;

    const s=document.createElement('script');
    if(asModule)s.type='module';
    s.textContent=code;
    document.documentElement.appendChild(s);
    s.remove();
  }


  /************ 5️⃣ WebCrypto + Brotli 解密 ************/

  function ensureWebCrypto() {
    const cryptoApi = window.crypto || window.msCrypto;
    if (!cryptoApi || !cryptoApi.subtle) {
      throw new Error('当前浏览器不支持 Web Crypto API');
    }
    return cryptoApi;
  }

  let brotliLoadingPromise = null;
  async function ensureBrotliLoaded() {
    if (window.__editModeBrotliDecompress) return window.__editModeBrotliDecompress;
    if (brotliLoadingPromise) return brotliLoadingPromise;

    const importUrls = [
      'https://esm.sh/brotli-compress@1.3.3/js',
      'https://cdn.jsdelivr.net/npm/brotli-compress@1.3.3/js/+esm'
    ];

    brotliLoadingPromise = (async () => {
      let mod = null;
      let lastErr = null;

      for (const url of importUrls) {
        try {
          mod = await import(/* @vite-ignore */ url);
          if (mod && typeof mod.decompress === 'function') {
            window.__editModeBrotliDecompress = mod.decompress;
            console.log('[loader] Brotli 解压模块加载成功:', url);
            return mod.decompress;
          }
        } catch (e) {
          lastErr = e;
          console.warn('[loader] Brotli 模块加载失败:', url, e);
        }
      }

      throw lastErr || new Error('Brotli 解压模块加载失败');
    })();

    return brotliLoadingPromise;
  }

  function b64ToBytes(b64) {
    if (!b64) return new Uint8Array(0);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function concatBytes(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  async function deriveAesKey(password, saltBytes, iterations) {
    const cryptoApi = ensureWebCrypto();
    const passKey = await cryptoApi.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    return cryptoApi.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: iterations,
        hash: 'SHA-256'
      },
      passKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['decrypt']
    );
  }

  async function decryptWithPassphrase(pass, encJson) {
    const cryptoApi = ensureWebCrypto();

    if (!encJson || !encJson.c || !encJson.s || !encJson.i || !encJson.t) {
      throw new Error('加密 JSON 格式不正确，缺少必要字段（s/i/t/c）');
    }

    const version = encJson.v || 3;
    const algo = encJson.a || '';
    const kdf = encJson.k || '';
    const zip = encJson.z || '';
    const iterations = encJson.n || 200000;

    if (version !== 3) {
      throw new Error('加密版本不匹配：当前启动器仅支持 v3 格式');
    }
    if (algo !== 'a256gcm') {
      throw new Error('算法不匹配：当前启动器仅支持 AES-256-GCM');
    }
    if (kdf !== 'p2s256') {
      throw new Error('KDF 不匹配：当前启动器仅支持 PBKDF2-SHA256');
    }

    const salt = b64ToBytes(encJson.s);
    const iv = b64ToBytes(encJson.i);
    const tag = b64ToBytes(encJson.t);
    const ciphertext = b64ToBytes(encJson.c);
    const combined = concatBytes(ciphertext, tag);

    const key = await deriveAesKey(pass, salt, iterations);

    let decryptedBuf;
    try {
      decryptedBuf = await cryptoApi.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          tagLength: 128
        },
        key,
        combined
      );
    } catch (e) {
      throw new Error('解密失败：口令错误或密文格式不匹配');
    }

    let outputBytes = new Uint8Array(decryptedBuf);

    if (zip === 'br') {
      const decompress = await ensureBrotliLoaded();
      try {
        outputBytes = decompress(outputBytes);
      } catch (e) {
        console.error('[loader] Brotli 解压失败:', e);
        throw new Error('Brotli 解压失败，密文可能损坏或浏览器环境不兼容');
      }
    } else if (zip && zip !== 'none') {
      throw new Error('不支持的压缩格式: ' + zip);
    }

    const plaintext = new TextDecoder().decode(outputBytes);
    if (!plaintext) {
      throw new Error('解密后内容为空');
    }
    return plaintext;
  }

  /************ 6️⃣ 样式（弹窗 UI） ************/

  if (!document.getElementById('modalStyle') && !window.editModeStyleInjected) {
    window.editModeStyleInjected = true;
    const style=document.createElement('style');
    style.id='modalStyle';
    style.textContent=`
      @keyframes shake {0%,100%{transform:translateX(0);}20%,60%{transform:translateX(-5px);}40%,80%{transform:translateX(5px);}}
      .shake { animation: shake 0.4s ease; }
      .nice-btn {padding:8px 18px;border:none;border-radius:10px;color:white;cursor:pointer;font-size:14px;transition:all 0.25s ease;}
      .btn-ok {background:linear-gradient(135deg,#2ecc71,#27ae60);}
      .btn-ok:hover {box-shadow:0 4px 10px rgba(46,204,113,0.4);transform:translateY(-1px);}
      .btn-cancel {background:linear-gradient(135deg,#bdc3c7,#95a5a6);}
      .btn-cancel:hover {box-shadow:0 4px 10px rgba(149,165,166,0.4);transform:translateY(-1px);}
      input:focus {border-color:#2ecc71!important;box-shadow:0 0 5px rgba(46,204,113,0.6);}
      .toggle {position:relative;width:46px;height:24px;border-radius:20px;background:#ccc;transition:background 0.3s;cursor:pointer;}
      .toggle::before {content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;transition:all 0.3s ease;box-shadow:0 1px 4px rgba(0,0,0,0.3);}
      .toggle.checked {background:linear-gradient(135deg,#2ecc71,#27ae60);}
      .toggle.checked::before {transform:translateX(22px);}
      .remember-label {margin-left:8px;font-size:13px;color:#444;user-select:none;}
      .eye-btn {position:absolute;right:14px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:18px;color:#777;transition:color 0.2s;line-height:1;}
      .eye-btn:hover {color:#2ecc71;}
      .eye-btn.hide::after {content:"./";position:absolute;left:3px;top:0;transform:rotate(12deg);font-weight:bold;color:#777;}
    `;
    document.head.appendChild(style);
  }

  /************ 7️⃣ 口令输入弹窗 ************/

  function showPassphraseModal(errorMsg='', prevPass='') {
    return new Promise(resolve=>{
      // 防止重复弹窗
      if (document.querySelector('#editModePassphraseModal')) {
        console.log('[loader] 弹窗已存在，跳过重复创建');
        return;
      }

      const overlay=document.createElement('div');
      overlay.id = 'editModePassphraseModal';
      overlay.style.cssText=`position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.25);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;`;
      const box=document.createElement('div');
      box.style.cssText=`background:rgba(255,255,255,0.9);border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.3);width:360px;max-width:90%;padding:24px 20px;font-family:system-ui,Segoe UI;text-align:center;transition:transform 0.3s;`;
      box.innerHTML=`
        <h2 style="margin:0 0 12px;font-size:18px;color:#333;">🔒 解密口令</h2>
        <div id="errorText" style="height:20px;margin-bottom:8px;font-size:13px;color:${errorMsg ? '#e74c3c' : 'transparent'};background:${errorMsg ? 'rgba(231,76,60,0.08)' : 'transparent'};border-radius:6px;padding:2px 0;transition:all 0.3s;">${errorMsg || '占位'}</div>
        <div style="position:relative;width:90%;margin:auto;">
          <input type="password" id="passInput" placeholder="请输入解密口令" style="width:100%;padding:8px 36px 8px 8px;border:1px solid #ccc;border-radius:8px;font-size:14px;outline:none;" value="${prevPass || ''}">
          <button id="eyeBtn" class="eye-btn hide">👁</button>
        </div>
        <div style="margin-top:12px;display:flex;align-items:center;justify-content:center;gap:8px;">
          <div class="toggle ${prevPass ? 'checked' : ''}" id="toggleBtn"></div>
          <span class="remember-label">记住口令</span>
        </div>
        <div style="margin-top:18px;display:flex;justify-content:center;gap:10px;">
          <button id="okBtn" class="nice-btn btn-ok">确定</button>
          <button id="cancelBtn" class="nice-btn btn-cancel">取消</button>
        </div>
      `;
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      const input = box.querySelector('#passInput');
      const eye = box.querySelector('#eyeBtn');
      const toggle = box.querySelector('#toggleBtn');

      // 修复输入框无法输入问题
      setTimeout(() => {
        try {
          input.removeAttribute('readonly');
          input.focus();
          input.selectionStart = input.value.length;
        } catch(e) { console.warn('focus 修复失败:', e); }
      }, 50);

      // 防止外部脚本抢焦点
      overlay.addEventListener('mousedown', e => e.stopPropagation(), true);
      overlay.addEventListener('mouseup', e => e.stopPropagation(), true);
      input.addEventListener('mousedown', e => e.stopPropagation(), true);
      input.addEventListener('keydown', e => e.stopPropagation(), true);
      input.addEventListener('input', e => e.stopPropagation(), true);

      let show=false;
      eye.classList.add('hide');
      eye.onclick=()=>{
        show=!show;
        input.type=show?'text':'password';
        eye.classList.toggle('hide',!show);
      };

      let remember=!!prevPass;
      toggle.onclick=()=>{remember=!remember;toggle.classList.toggle('checked',remember);};

      const cleanup=()=>{
        if (overlay && overlay.parentNode) {
          overlay.remove();
        }
      };
      const submit=()=>{
        const val=input.value.trim();
        cleanup();
        resolve({pass:val||null,remember});
      };
      box.querySelector('#okBtn').onclick=submit;
      box.querySelector('#cancelBtn').onclick=()=>{cleanup();resolve({pass:null,remember:false});};
      input.addEventListener('keydown',e=>{if(e.key==='Enter')submit();});
      resolve.updateError=(msg)=>{
        const err=box.querySelector('#errorText');
        err.textContent=msg||'';
        err.style.color=msg?'#e74c3c':'transparent';
        err.style.background=msg?'rgba(231,76,60,0.08)':'transparent';
        box.classList.remove('shake');void box.offsetWidth;box.classList.add('shake');
      };
    });
  }

  /************ 8️⃣ 主逻辑 ************/

  (async()=>{
    try{
      // 检查是否已存在工具栏面板，如果存在则直接退出
      if (isToolbarPanelExists()) {
        console.log('[loader] 检测到工具栏面板已存在，跳过脚本执行');
        return;
      }

      console.log('[loader] 开始并发从多镜像源下载加密JSON…');
      let enc;
      try {
        enc = JSON.parse(await fetchTextFromMultiple(remoteEncryptedUrls));
      } catch (e) {
        console.warn('[loader] 远程加密文件下载失败，尝试使用本地缓存:', e);
        if (injectCachedScriptIfAvailable()) return;
        throw e;
      }

      // 1️⃣ 固定口令优先（可选）
      if (FIXED_PASSPHRASE) {
        try{
          const code = await decryptWithPassphrase(FIXED_PASSPHRASE, enc);
          saveCachedScript(code);
          injectAndRun(code);
          return;
        } catch(e){
          console.warn('固定口令解密失败，继续其他模式:', e);
        }
      }

      // 2️⃣ 尝试远程口令（pass.txt，可选）
      if (passphraseUrls && passphraseUrls.length > 0) {
        let remotePass = null;
        try {
          console.log('[loader] 开始并发从多镜像源获取远程口令…');
          remotePass = (await fetchTextFromMultiple(passphraseUrls)).trim();
          if (remotePass) {
            console.log('[loader] 检测到远程口令，尝试解密…');
            try {
              const code = await decryptWithPassphrase(remotePass, enc);
              saveCachedScript(code);
              injectAndRun(code);
              console.log('[loader] 使用远程口令解密成功 ✅');
              remotePass = null;
              return;
            } catch (e) {
              console.warn('[loader] 远程口令存在但解密失败，将进入输入框流程:', e);
              remotePass = null;
            }
          } else {
            console.warn('[loader] 远程口令为空，进入输入框流程');
          }
        } catch (e) {
          console.warn('[loader] 获取远程口令失败，进入输入框流程:', e);
        }
      }

      // 3️⃣ 再次检查工具栏面板
      if (isToolbarPanelExists()) {
        console.log('[loader] 在弹窗前检测到工具栏面板已存在，跳过弹窗');
        return;
      }

      // 4️⃣ 弹窗输入口令（预填本地记住的）
      const savedPass = safeGetLocal(STORAGE_KEY) || '';
      let errMsg = '';
      while (true) {
        if (isToolbarPanelExists()) {
          console.log('[loader] 检测到工具栏面板已存在，终止弹窗流程');
          return;
        }

        const modal = await showPassphraseModal(errMsg, savedPass);
        if (!modal.pass) {
          console.warn('用户取消');
          return;
        }
        try {
          const code = await decryptWithPassphrase(modal.pass, enc);
          if (modal.remember) {
            safeSetLocal(STORAGE_KEY, modal.pass);
          } else {
            safeSetLocal(STORAGE_KEY, null);
          }
          saveCachedScript(code);
          injectAndRun(code);
          console.log('[loader] 解密成功 ✅');
          return;
        } catch (e) {
          console.warn('解密失败:', e);
          errMsg = '❌ 口令错误、密文不匹配或浏览器不兼容，请重试';
          if (typeof modal.updateError === 'function') modal.updateError(errMsg);
        }
      }

    }catch(e){
      console.error('[loader] 加载流程错误:', e);
      if (e && e.message && e.message.toLowerCase().includes('timeout')) {
        alert('脚本加载失败：请检查网络或刷新重试几次，刷新后请等待一会');
      } else if (e && e.message && e.message.includes('所有镜像源均失败')) {
        alert('脚本加载失败：请检查网络或刷新重试几次，刷新后请等待一会');
      } else {
        alert('脚本加载失败：' + (e && e.message ? e.message : String(e)));
      }
    }
  })();
})();
