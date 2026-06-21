# Bilibili 本地屏蔽器

一个用于 B 站网页端的 Chrome 扩展。它不会修改 B 站账号黑名单，而是在本机浏览器里隐藏命中的视频和评论内容。

## 功能

- 本地拉黑 UID：按 UP 主/用户 UID 隐藏相关视频、评论、用户卡片，并拦截命中的个人主页和视频页。
- 用户名关键词：按用户名关键词隐藏内容，并拦截命中的用户页面内容。
- 视频标题关键词：隐藏标题命中的视频卡片。
- 评论关键词：隐藏评论内容命中的评论。
- 规则库管理：输入后点击“添加”，规则会进入库中；库里的每一项都可以单独删除。
- 本地保存：规则保存在浏览器扩展存储中，刷新网页后仍然生效。

## 安装

1. 下载或克隆本仓库到本地。
2. 打开 Chrome，进入：

```text
chrome://extensions/
```

3. 打开右上角“开发者模式”。
4. 点击“加载已解压的扩展程序”。
5. 选择本项目里的 `extension` 文件夹。

也可以运行辅助脚本：

```text
scripts\open-chrome-extensions-and-copy-path.cmd
```

它会打开 Chrome 扩展页面，并把 `extension` 文件夹路径复制到剪贴板。

## 注意事项

- 这是本地隐藏，不会增加或修改 B 站官方黑名单。
- 只在安装了此扩展的浏览器中生效。
- B 站页面结构变更时，部分选择器可能需要更新。

## 项目结构

```text
extension/
  manifest.json
  background.js
  content.js
  options.html
  options.js
scripts/
  open-chrome-extensions-and-copy-path.cmd
```

## 开发

修改 `extension` 目录中的文件后，在 `chrome://extensions/` 中点击本扩展的“重新加载”，然后刷新 B 站页面即可看到效果。
