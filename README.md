# 恶雌模拟器

兽世题材的 AI 恋爱养成游戏。你是兽神强行配给一群落魄兽夫的「妻主」：他们被废、被逐、被追杀，戒备、嘴硬、各怀心事；好感要一点点挣，世界每个小时都在自己往前走。

> **18+ 成人向内容。** 未满 18 岁请不要安装。

- 🎲 开局自己选兽夫、排登场顺序、给他们改名（也可以全部随机）
- 🕐 游戏时间和你的现实时间同步，天气是你所在城市的真实天气
- 🧠 游戏的大脑可以是本地模型（llama.cpp / Ollama / LM Studio）、Claude（Claude Code 或 API）、线上 API（DeepSeek、GPT、Gemini、通义、Kimi、智谱、硅基流动、OpenRouter、Grok……）
- ✨ 自定义玩法：用大白话说想怎么改游戏，大脑帮你改成规则
- 💾 多个存档：新建、加载、改名、删除，每局各玩各的
- 🔊 每个角色有自己的声音（本地配音，可选）
- 📱 手机和电脑连同一个 Wi-Fi，扫码就能用手机玩

## 安装（Windows）

按 `Win + R`，输入 `powershell` 回车，把下面这一行粘贴进去，回车：

```powershell
irm https://raw.githubusercontent.com/mxxs109-ops/eci-simulator/main/install.ps1 | iex
```

桌面上会出现 **「恶雌模拟器安装器」**。之后的事都在安装器里点：

| | |
|---|---|
| 🎮 游戏本体 | 安装、更新（有新版本会提醒，更新不动存档） |
| 🧠 语言模型 | 十几家可选，每家怎么申请 key 都有手把手步骤；本地模型先检查你的电脑带不带得动 |
| 🎙️ 配音 | 先检查，通过了才能装 |
| 💾 存档 | 新建、加载、改名、删除存档 |
| ✨ 自定义玩法 | 装好语言模型后可用：写下想怎么改，大脑整理成规则，优先于原规则；可随时清空恢复原样 |
| 📱 用手机玩 | 安卓 App 下载和连接步骤 |
| 💬 留言板 | 所有人的留言都能看到；发留言要一个 GitHub 账号 |
| 📁 安装位置 | 选装在哪；装好以后也能整个搬走 |
| 🧹 卸载 | 一键删干净，不留残余 |

## 电脑要求

| 想用的功能 | 要求 |
|---|---|
| 只用线上 API 或 Claude Code | 任何能上网的 Windows 10/11 电脑 |
| 本地模型（完整版） | NVIDIA 显卡 12GB 显存以上、内存 32GB 以上、硬盘 25GB |
| 本地模型（轻量版） | NVIDIA 显卡 6GB 以上（或 AMD/Intel 显卡）、内存 24GB 以上、硬盘 17GB |
| 配音 | NVIDIA 显卡 8GB 显存以上、驱动 570 以上、硬盘 25GB |

## 用到的开源项目

- [llama.cpp](https://github.com/ggml-org/llama.cpp)（MIT）：跑本地模型
- [Qwen3.6-35B-A3B](https://huggingface.co/Qwen) 社区去审查版 [HauhauCS/Qwen3.6-35B-A3B-Uncensored](https://huggingface.co/HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive)：本地语言模型
- [IndexTTS-2.5](https://github.com/index-tts/index-tts)：本地配音（安装时从官方下载，许可以官方为准）
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（MIT）：手机连接二维码

角色和世界观改编自原作小说，已获原作者授权。
