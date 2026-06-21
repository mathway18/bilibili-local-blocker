const RULES_KEY = "rules";

const DEFAULT_RULES = {
  enabled: true,
  uids: [],
  names: [],
  titleKeywords: [],
  commentKeywords: [],
  danmakuKeywords: [],
};

const CATEGORIES = [
  { key: "uids", empty: "还没有本地拉黑 UID" },
  { key: "names", empty: "还没有用户名关键词" },
  { key: "titleKeywords", empty: "还没有视频标题关键词" },
  { key: "commentKeywords", empty: "还没有评论关键词" },
  { key: "danmakuKeywords", empty: "还没有弹幕关键词" },
];

const fields = {
  enabled: document.getElementById("enabled"),
};

const categoryNodes = Object.fromEntries(
  CATEGORIES.map(({ key }) => [
    key,
    {
      input: document.getElementById(`input-${key}`),
      list: document.getElementById(`list-${key}`),
      count: document.getElementById(`count-${key}`),
    },
  ])
);

const statusNode = document.getElementById("status");
let currentRules = { ...DEFAULT_RULES };

loadRules();

fields.enabled.addEventListener("change", async () => {
  currentRules.enabled = fields.enabled.checked;
  await persist();
  showStatus(currentRules.enabled ? "已启用本地屏蔽。" : "已暂停本地屏蔽。");
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => addFromInput(button.dataset.add));
});

Object.entries(categoryNodes).forEach(([key, nodes]) => {
  nodes.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addFromInput(key);
  });
});

document.getElementById("save").addEventListener("click", async () => {
  currentRules.enabled = fields.enabled.checked;
  await persist();
  showStatus("规则库已保存。打开或刷新 B 站后生效。");
});

document.getElementById("openBili").addEventListener("click", async () => {
  currentRules.enabled = fields.enabled.checked;
  await persist();
  chrome.tabs.create({ url: "https://www.bilibili.com/" });
  showStatus("已保存，并打开 B 站。");
});

document.getElementById("export").addEventListener("click", async () => {
  await navigator.clipboard.writeText(JSON.stringify(currentRules, null, 2));
  showStatus("规则已复制到剪贴板。");
});

document.getElementById("import").addEventListener("click", async () => {
  const text = prompt("粘贴之前导出的 JSON：");
  if (!text) return;
  try {
    currentRules = normalizeRules(JSON.parse(text));
    render();
    await persist();
    showStatus("导入并保存成功。");
  } catch {
    showStatus("导入失败：内容不是有效 JSON。", true);
  }
});

function loadRules() {
  chrome.storage.local.get(RULES_KEY, (result) => {
    currentRules = normalizeRules(result[RULES_KEY]);
    render();
  });
}

function addFromInput(key) {
  const input = categoryNodes[key].input;
  const values = parseLines(input.value)
    .map((value) => normalizeItem(key, value))
    .filter(Boolean);

  if (!values.length) {
    showStatus(key === "uids" ? "请输入有效 UID。" : "请输入要添加的内容。", true);
    return;
  }

  const before = currentRules[key].length;
  currentRules[key] = uniqueClean([...currentRules[key], ...values]);
  input.value = "";
  renderCategory(key);
  persist();

  const added = currentRules[key].length - before;
  showStatus(added ? `已添加 ${added} 条。` : "库里已经有这条了。");
}

function removeItem(key, value) {
  currentRules[key] = currentRules[key].filter((item) => item !== value);
  renderCategory(key);
  persist();
  showStatus("已删除。");
}

function render() {
  fields.enabled.checked = currentRules.enabled;
  CATEGORIES.forEach(({ key }) => renderCategory(key));
}

function renderCategory(key) {
  const { list, count } = categoryNodes[key];
  const items = currentRules[key];
  count.textContent = String(items.length);
  list.textContent = "";

  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = CATEGORIES.find((item) => item.key === key).empty;
    list.append(empty);
    return;
  }

  items.forEach((value) => {
    const item = document.createElement("span");
    item.className = "rule-item";

    const text = document.createElement("span");
    text.className = "rule-text";
    text.title = value;
    text.textContent = value;

    const remove = document.createElement("button");
    remove.className = "remove-rule";
    remove.type = "button";
    remove.title = `删除 ${value}`;
    remove.setAttribute("aria-label", `删除 ${value}`);
    remove.textContent = "x";
    remove.addEventListener("click", () => removeItem(key, value));

    item.append(text, remove);
    list.append(item);
  });
}

function persist() {
  currentRules = normalizeRules(currentRules);
  return saveRules(currentRules);
}

function saveRules(rules) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [RULES_KEY]: normalizeRules(rules) }, resolve);
  });
}

function normalizeRules(value) {
  const next = { ...DEFAULT_RULES, ...(value || {}) };
  return {
    enabled: next.enabled !== false,
    uids: uniqueClean(next.uids).map((uid) => normalizeItem("uids", uid)).filter(Boolean),
    names: uniqueClean(next.names),
    titleKeywords: uniqueClean(next.titleKeywords),
    commentKeywords: uniqueClean(next.commentKeywords),
    danmakuKeywords: uniqueClean(next.danmakuKeywords),
  };
}

function normalizeItem(key, value) {
  const text = String(value || "").trim();
  if (key === "uids") return text.replace(/[^\d]/g, "");
  return text;
}

function parseLines(value) {
  return uniqueClean(String(value || "").split(/[\n,，;；]+/));
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

function showStatus(text, isError = false) {
  statusNode.textContent = text;
  statusNode.style.color = isError ? "#cf222e" : "#00875a";
}
