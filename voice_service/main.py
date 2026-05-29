"""
main.py — IndexTTS-2 FastAPI inference server.

Start:
    cd voice_service
    uvicorn main:app --host 0.0.0.0 --port 8000

Prerequisites (one-time setup):
    pip install -r requirements.txt
    huggingface-cli download IndexTeam/IndexTTS-2 --local-dir checkpoints

POST /tts
    Body: { "text": "..." }
    Returns: audio/wav synthesised in your voice (from voices/emma_ref.wav)

GET /health
    Returns: { "status": "ok", "ref_audio": "...", "fp16": bool }
"""
import io
import os
import tempfile

import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


cfg = load_config()
vs_cfg = cfg["voice_service"]
base_dir = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Emma Voice Service")

# ── Load IndexTTS-2 using the official API ───────────────────────────────────
checkpoints_dir = os.path.join(base_dir, "checkpoints")
checkpoints_cfg = os.path.join(checkpoints_dir, "config.yaml")

if not os.path.exists(checkpoints_cfg):
    raise RuntimeError(
        f"IndexTTS-2 model weights not found at {checkpoints_dir}.\n"
        "Run once: huggingface-cli download IndexTeam/IndexTTS-2 --local-dir voice_service/checkpoints"
    )

import torch  # noqa: E402
from indextts.infer_v2 import IndexTTS2  # noqa: E402

use_fp16 = torch.cuda.is_available()  # fp16 requires CUDA; CPU runs in fp32
tts_model = IndexTTS2(
    cfg_path=checkpoints_cfg,
    model_dir=checkpoints_dir,
    use_fp16=use_fp16,
    use_cuda_kernel=False,  # set True only if you built the CUDA kernel extension
)
print(f"[voice] IndexTTS-2 ready (fp16={use_fp16})")

# Verify reference audio exists — created by prepare_data.py
ref_path = os.path.join(base_dir, vs_cfg["reference_audio"])
if not os.path.exists(ref_path):
    raise RuntimeError(
        f"Reference audio not found at {ref_path}.\n"
        "Run: python prepare_data.py"
    )
print(f"[voice] Voice reference: {ref_path}")

# Optional emotion reference — controls warmth/expressiveness independently of voice identity.
# Record yourself speaking in Emma's tone and save to voices/emma_emotion_ref.wav.
emo_path_cfg = vs_cfg.get("emotion_audio", "")
emo_path = os.path.join(base_dir, emo_path_cfg) if emo_path_cfg else None
if emo_path and os.path.exists(emo_path):
    print(f"[voice] Emotion reference: {emo_path}")
else:
    emo_path = None
    print("[voice] No emotion reference — delivery will be flat. Record voices/emma_emotion_ref.wav for warmth.")


# ── Request / response ───────────────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str


# ── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": "IndexTeam/IndexTTS-2",
        "ref_audio": ref_path,
        "fp16": use_fp16,
    }


@app.post("/tts")
def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text exceeds 2000 chars")

    # IndexTTS-2 writes output to a file; use a temp file and stream it back
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        out_path = tmp.name

    try:
        tts_model.infer(
            spk_audio_prompt=ref_path,      # ← your voice identity
            text=text,
            output_path=out_path,
            emo_audio_prompt=emo_path,      # ← emotional delivery (None = flat default)
        )
        with open(out_path, "rb") as f:
            audio_bytes = f.read()
    except Exception as exc:
        print(f"[voice] TTS error: {exc}")
        raise HTTPException(status_code=500, detail="TTS synthesis failed") from exc
    finally:
        if os.path.exists(out_path):
            os.unlink(out_path)

    return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav")
