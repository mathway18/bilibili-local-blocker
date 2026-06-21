(function () {
  "use strict";

  const RULES_KEY = "rules";
  const LEGACY_STORAGE_KEY = "biliSoftBlock.rules.v1";
  const STYLE_ID = "bili-soft-block-style";
  const PANEL_ID = "bili-soft-block-panel";
  const BUTTON_ID = "bili-soft-block-button";
  const HIDDEN_ATTR = "data-bili-soft-block-hidden";

  const DEFAULT_RULES = {
    enabled: true,
    uids: [],
    names: [],
    titleKeywords: [],
    commentKeywords: [],
    danmakuKeywords: [],
  };

  const CARD_SELECTORS = [
    ".bili-video-card",
    ".bili-video-card__wrap",
    ".video-card",
    ".feed-card",
    ".card-box",
    ".video-item",
    ".small-item",
    ".bili-dyn-list__item",
    ".bili-dyn-item",
    ".list-item",
    ".rank-item",
    ".article-card",
    ".video-page-card-small",
    ".recommend-video-card",
  ].join(",");

  const COMMENT_SELECTORS = [
    ".reply-item",
    ".reply-wrap",
    ".sub-reply-item",
    ".comment-list .list-item",
    ".bili-comment",
    "[class*='reply-item']",
    "[class*='comment-item']",
  ].join(",");

  const AUTHOR_SELECTORS = [
    "a[href*='space.bilibili.com']",
    ".up-name",
    ".bili-video-card__info--author",
    ".bili-video-card__info--owner",
    ".name",
    ".user-name",
    "[class*='user-name']",
    "[class*='author']",
  ].join(",");

  const TITLE_SELECTORS = [
    "a[title]",
    ".bili-video-card__info--tit",
    ".title",
    ".video-title",
    "[class*='title']",
  ].join(",");

  const COMMENT_TEXT_SELECTORS = [
    ".reply-content",
    ".text",
    ".content",
    ".con",
    "[class*='content']",
  ].join(",");

  const DANMAKU_SELECTORS = [
    ".b-danmaku",
    ".bpx-player-row-dm-wrap",
    ".bpx-player-dm-wrap",
    ".bpx-player-dm-dm",
    "[class*='danmaku']",
  ].join(",");

  let rules = { ...DEFAULT_RULES };
  let scanTimer = 0;

  boot();

  async function boot() {
    injectStyle();
    mountButton();
    rules = await loadRules();
    openPanelWhenEmpty();
    scheduleScan();

    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.addEventListener("keydown", (event) => {
      if (event.altKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        togglePanel();
      }
    });

    if (hasChromeStorage() && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local" || !changes[RULES_KEY]) return;
        rules = normalizeRules(changes[RULES_KEY].newValue);
        resetHiddenState();
        scheduleScan();
        refreshPanelValues();
      });
    }
  }

  async function loadRules() {
    const stored = await storageGet(RULES_KEY);
    if (stored) return normalizeRules(stored);

    const legacy = loadLegacyRules();
    if (legacy) {
      await saveRules(legacy);
      return normalizeRules(legacy);
    }

    return { ...DEFAULT_RULES };
  }

  function loadLegacyRules() {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) {
        try {
          const raw = localStorage.getItem(`biliSoftBlock.extension.${key}`);
          resolve(raw ? JSON.parse(raw) : null);
        } catch {
          resolve(null);
        }
        return;
      }
      chrome.storage.local.get(key, (result) => resolve(result ? result[key] : null));
    });
  }

  function storageSet(value) {
    return new Promise((resolve) => {
      if (!hasChromeStorage()) {
        localStorage.setItem(`biliSoftBlock.extension.${RULES_KEY}`, JSON.stringify(value));
        resolve();
        return;
      }
      chrome.storage.local.set({ [RULES_KEY]: value }, resolve);
    });
  }

  function hasChromeStorage() {
    return (
      typeof chrome !== "undefined" &&
      chrome.storage &&
      chrome.storage.local
    );
  }

  async function saveRules(nextRules) {
    rules = normalizeRules(nextRules);
    await storageSet(rules);
    resetHiddenState();
    scheduleScan();
  }

  function normalizeRules(value) {
    const next = { ...DEFAULT_RULES, ...(value || {}) };
    return {
      enabled: next.enabled !== false,
      uids: uniqueClean(next.uids).map((uid) => uid.replace(/[^\d]/g, "")).filter(Boolean),
      names: uniqueClean(next.names),
      titleKeywords: uniqueClean(next.titleKeywords),
      commentKeywords: uniqueClean(next.commentKeywords),
      danmakuKeywords: uniqueClean(next.danmakuKeywords),
    };
  }

  function uniqueClean(items) {
    return Array.from(
      new Set(
        (Array.isArray(items) ? items : String(items || "").split(/\s+/))
          .map((item) => String(item).trim())
          .filter(Boolean)
      )
    );
  }

  function parseLines(value) {
    return uniqueClean(String(value || "").split(/[\n,，;；]+/));
  }

  function hasAnyRule(value) {
    return (
      value.uids.length ||
      value.names.length ||
      value.titleKeywords.length ||
      value.commentKeywords.length ||
      value.danmakuKeywords.length
    );
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = window.setTimeout(() => {
      scanTimer = 0;
      scanPage();
    }, 160);
  }

  function scanPage() {
    if (!rules.enabled) {
      resetHiddenState();
      return;
    }

    const uidSet = new Set(rules.uids);
    const nameRules = rules.names.map(normalizeText);
    const titleRules = rules.titleKeywords.map(normalizeText);
    const commentRules = rules.commentKeywords.map(normalizeText);
    const danmakuRules = rules.danmakuKeywords.map(normalizeText);

    document.querySelectorAll(CARD_SELECTORS).forEach((node) => {
      if (node.closest(`#${PANEL_ID}`)) return;
      const uid = extractUid(node);
      const author = normalizeText(extractText(node, AUTHOR_SELECTORS));
      const title = normalizeText(extractText(node, TITLE_SELECTORS));
      const text = normalizeText(node.textContent);
      const shouldHide =
        (uid && uidSet.has(uid)) ||
        includesAny(author, nameRules) ||
        includesAny(title, titleRules) ||
        includesAny(text, titleRules);
      setHidden(node, shouldHide);
    });

    document.querySelectorAll(COMMENT_SELECTORS).forEach((node) => {
      if (node.closest(`#${PANEL_ID}`)) return;
      const uid = extractUid(node);
      const author = normalizeText(extractText(node, AUTHOR_SELECTORS));
      const content = normalizeText(extractText(node, COMMENT_TEXT_SELECTORS) || node.textContent);
      const shouldHide =
        (uid && uidSet.has(uid)) ||
        includesAny(author, nameRules) ||
        includesAny(content, commentRules);
      setHidden(node, shouldHide);
    });

    document.querySelectorAll(DANMAKU_SELECTORS).forEach((node) => {
      if (node.closest(`#${PANEL_ID}`)) return;
      const text = normalizeText(node.textContent);
      setHidden(node, includesAny(text, danmakuRules));
    });
  }

  function extractUid(node) {
    const link = node.querySelector("a[href*='space.bilibili.com']");
    const href = link ? link.getAttribute("href") || "" : "";
    const match = href.match(/space\.bilibili\.com\/(\d+)/);
    return match ? match[1] : "";
  }

  function extractText(node, selector) {
    const target = node.querySelector(selector);
    if (!target) return "";
    return target.getAttribute("title") || target.textContent || "";
  }

  function normalizeText(text) {
    return String(text || "").trim().toLowerCase();
  }

  function includesAny(text, keywords) {
    return Boolean(text) && keywords.some((keyword) => keyword && text.includes(keyword));
  }

  function setHidden(node, hidden) {
    if (hidden) {
      node.setAttribute(HIDDEN_ATTR, "true");
    } else if (node.getAttribute(HIDDEN_ATTR) === "true") {
      node.removeAttribute(HIDDEN_ATTR);
    }
  }

  function resetHiddenState() {
    document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((node) => {
      node.removeAttribute(HIDDEN_ATTR);
    });
  }

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${HIDDEN_ATTR}="true"] { display: none !important; }
      #${BUTTON_ID} {
        position: fixed;
        right: 16px;
        bottom: 76px;
        z-index: 2147483646;
        min-width: 98px;
        height: 42px;
        padding: 0 14px;
        border: 0;
        border-radius: 999px;
        background: #00a1d6;
        color: #fff;
        font-size: 15px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0,0,0,.18);
        cursor: pointer;
      }
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 126px;
        z-index: 2147483647;
        width: min(440px, calc(100vw - 32px));
        max-height: min(760px, calc(100vh - 150px));
        overflow: auto;
        box-sizing: border-box;
        padding: 16px;
        border: 1px solid rgba(0,0,0,.12);
        border-radius: 8px;
        background: #fff;
        color: #18191c;
        box-shadow: 0 18px 50px rgba(0,0,0,.22);
        font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      }
      #${PANEL_ID}[hidden] { display: none; }
      #${PANEL_ID} h2 {
        margin: 0 0 10px;
        font-size: 17px;
        line-height: 1.3;
        word-break: keep-all;
      }
      #${PANEL_ID} label {
        display: block;
        margin: 12px 0 6px;
        font-weight: 650;
      }
      #${PANEL_ID} input[type="text"] {
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        height: 34px;
        padding: 0 8px;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        color: #18191c;
        background: #fff;
        font: inherit;
      }
      #${PANEL_ID} .bili-soft-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
      }
      #${PANEL_ID} .bili-soft-rule {
        margin-top: 12px;
        padding: 10px;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        background: #fafafa;
      }
      #${PANEL_ID} .bili-soft-rule-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .bili-soft-count {
        min-width: 26px;
        padding: 1px 7px;
        border-radius: 999px;
        background: #eef6fb;
        color: #0077a8;
        text-align: center;
        font-size: 12px;
        font-weight: 700;
      }
      #${PANEL_ID} .bili-soft-add {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
      }
      #${PANEL_ID} .bili-soft-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        min-height: 38px;
        max-height: 92px;
        overflow: auto;
        margin-top: 8px;
      }
      #${PANEL_ID} .bili-soft-item {
        display: inline-flex;
        align-items: center;
        max-width: 100%;
        min-height: 28px;
        border: 1px solid #d0d7de;
        border-radius: 999px;
        background: #fff;
        overflow: hidden;
      }
      #${PANEL_ID} .bili-soft-text {
        min-width: 0;
        max-width: 220px;
        padding: 0 8px 0 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #${PANEL_ID} .bili-soft-remove {
        width: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-left: 1px solid #e5e7eb;
        border-radius: 0;
        background: #fff;
        color: #61666d;
        font-size: 17px;
        line-height: 1;
      }
      #${PANEL_ID} .bili-soft-empty {
        color: #61666d;
        font-size: 12px;
        align-self: center;
      }
      #${PANEL_ID} .bili-soft-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
      }
      #${PANEL_ID} button {
        border: 1px solid #d0d7de;
        border-radius: 6px;
        padding: 7px 10px;
        color: #18191c;
        background: #f6f8fa;
        cursor: pointer;
      }
      #${PANEL_ID} button.primary {
        border-color: #00a1d6;
        background: #00a1d6;
        color: #fff;
      }
      #${PANEL_ID} button.bili-soft-remove {
        width: 28px;
        min-height: 28px;
        height: 28px;
        padding: 0;
        border: 0;
        border-left: 1px solid #e5e7eb;
        border-radius: 0;
        background: #fff;
        color: #61666d;
        font-size: 17px;
        line-height: 1;
      }
      #${PANEL_ID} .bili-soft-note {
        margin-top: 10px;
        color: #61666d;
        font-size: 12px;
      }
      @media (max-width: 520px) {
        #${BUTTON_ID} {
          right: 10px;
          bottom: 56px;
        }
        #${PANEL_ID} {
          left: 10px;
          right: 10px;
          bottom: 106px;
          width: auto;
          max-height: calc(100vh - 126px);
        }
        #${PANEL_ID} .bili-soft-list {
          max-height: 78px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function mountButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.title = "B站本地软拉黑 Alt+B";
    button.textContent = "屏蔽设置";
    button.addEventListener("click", togglePanel);
    document.documentElement.appendChild(button);
  }

  function openPanelWhenEmpty() {
    const firstRunKey = "biliSoftBlock.firstPanelShown.v2";
    if (hasAnyRule(rules) || localStorage.getItem(firstRunKey) === "true") return;
    localStorage.setItem(firstRunKey, "true");
    window.setTimeout(() => {
      if (!document.getElementById(PANEL_ID)) {
        document.documentElement.appendChild(createPanel());
      }
    }, 600);
  }

  function togglePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      existing.hidden = !existing.hidden;
      return;
    }
    document.documentElement.appendChild(createPanel());
  }

  function createPanel() {
    const panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <h2>B站本地屏蔽</h2>
      <div class="bili-soft-row">
        <input id="bili-soft-enabled" type="checkbox">
        <label for="bili-soft-enabled" style="margin:0;font-weight:650;">启用</label>
      </div>
      ${createRuleSectionMarkup("uids", "本地拉黑 UID", "输入 UID")}
      ${createRuleSectionMarkup("names", "用户名关键词", "输入用户名关键词")}
      ${createRuleSectionMarkup("titleKeywords", "视频标题关键词", "输入标题关键词")}
      ${createRuleSectionMarkup("commentKeywords", "评论关键词", "输入评论关键词")}
      ${createRuleSectionMarkup("danmakuKeywords", "弹幕关键词", "输入弹幕关键词")}
      <div class="bili-soft-actions">
        <button class="primary" id="bili-soft-save" type="button">保存</button>
        <button id="bili-soft-options" type="button">打开管理器</button>
        <button id="bili-soft-close" type="button">关闭</button>
      </div>
      <div class="bili-soft-note">UID 屏蔽最准确；用户名和关键词属于本地模糊隐藏。弹幕只能按文本关键词隐藏。</div>
    `;

    bindPanel(panel);
    return panel;
  }

  function createRuleSectionMarkup(key, label, placeholder) {
    return `
      <section class="bili-soft-rule" data-category="${key}">
        <div class="bili-soft-rule-head">
          <label for="bili-soft-input-${key}" style="margin:0;font-weight:650;">${label}</label>
          <span class="bili-soft-count" id="bili-soft-count-${key}">0</span>
        </div>
        <div class="bili-soft-add">
          <input id="bili-soft-input-${key}" type="text" spellcheck="false" placeholder="${placeholder}">
          <button type="button" data-bili-soft-add="${key}">添加</button>
        </div>
        <div class="bili-soft-list" id="bili-soft-list-${key}"></div>
      </section>
    `;
  }

  function bindPanel(panel) {
    refreshPanelValues(panel);

    panel.querySelector("#bili-soft-enabled").addEventListener("change", async () => {
      rules.enabled = panel.querySelector("#bili-soft-enabled").checked;
      await saveRules(rules);
    });

    panel.querySelectorAll("[data-bili-soft-add]").forEach((button) => {
      button.addEventListener("click", () => addPanelItem(panel, button.dataset.biliSoftAdd));
    });

    ["uids", "names", "titleKeywords", "commentKeywords", "danmakuKeywords"].forEach((key) => {
      const input = panel.querySelector(`#bili-soft-input-${key}`);
      input.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        addPanelItem(panel, key);
      });
    });

    panel.querySelector("#bili-soft-save").addEventListener("click", async () => {
      await saveRules(readRulesFromPanel(panel));
      panel.querySelector("#bili-soft-save").textContent = "已保存";
      window.setTimeout(() => {
        const saveButton = panel.querySelector("#bili-soft-save");
        if (saveButton) saveButton.textContent = "保存";
      }, 1200);
    });

    panel.querySelector("#bili-soft-options").addEventListener("click", () => {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    });

    panel.querySelector("#bili-soft-close").addEventListener("click", () => {
      panel.hidden = true;
    });
  }

  function refreshPanelValues(panel = document.getElementById(PANEL_ID)) {
    if (!panel) return;
    panel.querySelector("#bili-soft-enabled").checked = rules.enabled;
    ["uids", "names", "titleKeywords", "commentKeywords", "danmakuKeywords"].forEach((key) => {
      renderPanelCategory(panel, key);
    });
  }

  function readRulesFromPanel(panel) {
    return {
      enabled: panel.querySelector("#bili-soft-enabled").checked,
      uids: rules.uids,
      names: rules.names,
      titleKeywords: rules.titleKeywords,
      commentKeywords: rules.commentKeywords,
      danmakuKeywords: rules.danmakuKeywords,
    };
  }

  function addPanelItem(panel, key) {
    const input = panel.querySelector(`#bili-soft-input-${key}`);
    const values = parseLines(input.value)
      .map((value) => normalizeItem(key, value))
      .filter(Boolean);
    if (!values.length) return;

    rules[key] = uniqueClean([...rules[key], ...values]);
    input.value = "";
    renderPanelCategory(panel, key);
    saveRules(rules);
  }

  function removePanelItem(panel, key, value) {
    rules[key] = rules[key].filter((item) => item !== value);
    renderPanelCategory(panel, key);
    saveRules(rules);
  }

  function renderPanelCategory(panel, key) {
    const list = panel.querySelector(`#bili-soft-list-${key}`);
    const count = panel.querySelector(`#bili-soft-count-${key}`);
    const items = rules[key] || [];
    count.textContent = String(items.length);
    list.textContent = "";

    if (!items.length) {
      const empty = document.createElement("span");
      empty.className = "bili-soft-empty";
      empty.textContent = "暂无";
      list.append(empty);
      return;
    }

    items.forEach((value) => {
      const item = document.createElement("span");
      item.className = "bili-soft-item";

      const text = document.createElement("span");
      text.className = "bili-soft-text";
      text.title = value;
      text.textContent = value;

      const remove = document.createElement("button");
      remove.className = "bili-soft-remove";
      remove.type = "button";
      remove.title = `删除 ${value}`;
      remove.textContent = "x";
      remove.addEventListener("click", () => removePanelItem(panel, key, value));

      item.append(text, remove);
      list.append(item);
    });
  }

  function normalizeItem(key, value) {
    const text = String(value || "").trim();
    if (key === "uids") return text.replace(/[^\d]/g, "");
    return text;
  }
})();
