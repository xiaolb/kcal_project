# 燃脂记录移动端 PWA

这是一个用于记录每日消耗大卡的移动端网页应用。数据保存在本机浏览器的 IndexedDB 中，支持按周、按月、最近半年和自定义时间范围查看消耗统计，并按大卡重新计算脂肪克数。

## 功能范围

- 每天提交一条消耗大卡记录；同一天再次提交会更新当天数据。
- 支持按周、按月、最近半年、自定义时间范围查询。
- 自动计算两类脂肪换算值：
  - 身体脂肪组织：`calories * 0.13`
  - 理论纯脂肪：`calories * 0.111`
- 使用 IndexedDB 本地存储，启动、保存、导入后会清理超过一年的数据。
- 支持导出和导入 Word 可打开的 `.doc` 文件。
- 支持通过浏览器分发给华为、安卓、苹果手机使用，不需要上应用商店。

## 本地运行

```bash
cd /Users/xiaolibin/Desktop/kcal/project
npm run serve:calorie
```

然后在浏览器打开：

```text
http://localhost:5179
```

同一局域网手机调试时，把 `localhost` 换成电脑的局域网 IP，例如：

```text
http://192.168.1.10:5179
```

## 手机分发方式

这个项目是 PWA，不需要应用商店分发。建议把整个 `project` 目录部署到一个 HTTP 或 HTTPS 静态服务上，然后把访问链接发给使用者。

- iPhone：用 Safari 打开链接，选择“添加到主屏幕”。
- 安卓手机：用 Chrome、系统浏览器或华为浏览器打开链接，选择“添加到主屏幕”或“安装应用”。
- 华为手机：建议用华为浏览器打开链接，再添加到桌面。

不要直接用 `file://` 打开 `index.html` 分发。模块脚本、Service Worker 和 PWA 安装在手机浏览器上需要 HTTP/HTTPS 环境。

## 数据规则

每条记录字段：

| 字段 | 说明 |
| --- | --- |
| `date` | 记录日期，格式 `YYYY-MM-DD` |
| `calories` | 当天消耗大卡，非负数字 |
| `updatedAt` | 更新时间，ISO UTC 时间 |
| `bodyFatGrams` | 导出时根据 `calories` 计算，导入时不校验 |
| `pureFatGrams` | 导出时根据 `calories` 计算，导入时不校验 |

导入时只信任 `date`、`calories`、`updatedAt`，页面展示和再次导出时都会根据 `calories` 重新计算 `bodyFatGrams` 与 `pureFatGrams`。

## Word 导入导出

导出文件是 Word 可打开的 `.doc` 文件，内容为 HTML 表格模板。导入时请使用本应用导出的 `.doc` 模板编辑数据，不建议另存为 `.docx` 后再导入。

导入合并规则：

- 同一天只有一条记录。
- 导入记录的 `updatedAt` 比本地更新时，覆盖本地记录。
- 导入记录更旧或格式不合法时跳过。
- 超过一年保存范围的记录会跳过或在清理时删除。

## 项目结构

```text
project/
  index.html              移动端页面
  styles.css              页面样式
  manifest.webmanifest    PWA 配置
  service-worker.js       离线缓存
  js/
    app.js                页面交互入口
    calculations.js       大卡与脂肪换算
    constants.js          常量
    date-utils.js         日期范围计算
    records.js            记录校验、筛选、导入合并
    storage.js            IndexedDB 存储
    word.js               Word 导入导出
  tests/                  Node 测试
```

## 验证命令

```bash
npm run test:calorie
node --check js/app.js
node --check service-worker.js
```
