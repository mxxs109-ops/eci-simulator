"""恶雌模拟器配音服务：IndexTTS-2.5 常驻显存，给游戏服务器（Node, 7788）按句生成配音。

启动：安装位置\\tts\\启动配音.bat（= cd index-tts && .venv\\Scripts\\python.exe tts_server.py，VOICE_DIR 由它设好）
接口：
  GET  /health                         → {"ok": true, "speakers": [...]}
  POST /tts  {"text", "speaker", "emo_text"?, "emo_alpha"?}  → audio/wav
    speaker  = 参考音频文件名（不带 .wav），在 VOICE_DIR 里找；找不到用「旁白」
    emo_text = 情绪提示（游戏里括号里的动作，比如「低笑」「声音发颤」）；不给就从台词本身推断
"""
import io, os, sys, threading, time, tempfile

# Windows 控制台默认 cp1252/gbk，IndexTTS 内部 print 中文会直接抛 UnicodeEncodeError
for s in (sys.stdout, sys.stderr):
    s.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

VOICE_DIR = os.environ["VOICE_DIR"]   # 游戏文件夹\配音\参考（每个角色一段参考音）
PORT = int(os.environ.get("TTS_PORT", "9880"))

from indextts.infer_v2_5 import IndexTTS2

here = os.path.dirname(os.path.abspath(__file__))
tts = IndexTTS2(cfg_path=os.path.join(here, "checkpoints", "config.yaml"),
                model_dir=os.path.join(here, "checkpoints"),
                use_bf16=True, use_cuda_kernel=False, use_qwen_emo=True)
lock = threading.Lock()   # 一张显卡，一次只做一句
app = FastAPI()


class Req(BaseModel):
    text: str
    speaker: str = "旁白"
    emo_text: str | None = None
    emo_alpha: float = 0.6


def ref_of(name):
    p = os.path.join(VOICE_DIR, name + ".wav")
    return p if os.path.exists(p) else os.path.join(VOICE_DIR, "旁白.wav")


@app.get("/health")
def health():
    sp = sorted(f[:-4] for f in os.listdir(VOICE_DIR) if f.endswith(".wav")) if os.path.isdir(VOICE_DIR) else []
    return {"ok": True, "speakers": sp}


@app.post("/tts")
def gen(r: Req):
    text = r.text.strip()
    if not text:
        raise HTTPException(400, "empty text")
    ref = ref_of(r.speaker)
    if not os.path.exists(ref):
        raise HTTPException(404, f"no reference voice for {r.speaker}")
    fd, out = tempfile.mkstemp(suffix=".wav"); os.close(fd)
    t0 = time.time()
    try:
        with lock:
            tts.infer(spk_audio_prompt=ref, text=text, lang="ZH", output_path=out,
                      use_emo_text=True, emo_text=(r.emo_text or text) if r.speaker != "旁白" else text,
                      emo_alpha=max(0.0, min(1.0, r.emo_alpha if r.speaker != "旁白" else 0.3)),
                      use_random=False, verbose=False)
        with open(out, "rb") as f:
            data = f.read()
    finally:
        try: os.remove(out)
        except OSError: pass
    print(f"[tts] {r.speaker} {len(text)}字 {time.time() - t0:.1f}s", flush=True)
    return Response(content=data, media_type="audio/wav")


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")
