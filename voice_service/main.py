"""
main.py — IndexTTS-2 FastAPI inference server.

Start:
    cd voice_service
    uvicorn main:app --host 0.0.0.0 --port 8000

POST /tts
    Body: { "text": "...", "exaggeration": 1.0, "cfg_weight": 0.5 }
    Returns: audio/wav

GET /health
    Returns: { "status": "ok", "model": "...", "mode": "zero-shot"|"finetuned", "device": "cpu"|"cuda" }
"""
import io
import os

import soundfile as sf
import torch
import yaml
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from transformers import AutoModel, AutoProcessor

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


cfg = load_config()
vs_cfg = cfg["voice_service"]

app = FastAPI(title="Emma Voice Service")

# ── Model loading (once at startup) ─────────────────────────────────────────
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[voice] Loading IndexTTS-2 on {device}…")

processor = AutoProcessor.from_pretrained(vs_cfg["model_id"])
model = AutoModel.from_pretrained(vs_cfg["model_id"]).to(device)

checkpoint = vs_cfg.get("finetuned_checkpoint", "")
if checkpoint and os.path.exists(checkpoint):
    state = torch.load(checkpoint, map_location=device)
    model.load_state_dict(state["model_state_dict"])
    MODE = "finetuned"
    print(f"[voice] Fine-tuned checkpoint loaded: {checkpoint}")
else:
    MODE = "zero-shot"
    print("[voice] Running in zero-shot mode")

model.eval()

# Pre-load reference audio for zero-shot cloning
ref_path = os.path.join(os.path.dirname(__file__), vs_cfg["reference_audio"])
if not os.path.exists(ref_path):
    raise RuntimeError(
        f"Reference audio not found at {ref_path}. Run prepare_data.py first."
    )
ref_audio, ref_sr = sf.read(ref_path)
if ref_audio.ndim > 1:
    ref_audio = ref_audio.mean(axis=1)  # stereo → mono
print(f"[voice] Reference audio: {ref_path} ({len(ref_audio) / ref_sr:.1f}s)")


# ── Request schema ───────────────────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str
    exaggeration: float = vs_cfg.get("exaggeration", 1.0)
    cfg_weight: float = 0.5


# ── Routes ───────────────────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "model": vs_cfg["model_id"], "mode": MODE, "device": device}


@app.post("/tts")
def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")
    if len(text) > 2000:
        raise HTTPException(status_code=400, detail="text exceeds 2000 chars")

    try:
        inputs = processor(
            text=text,
            audio=ref_audio,
            sampling_rate=ref_sr,
            return_tensors="pt",
        ).to(device)

        with torch.no_grad():
            # NOTE: Update generate() call signature if IndexTTS-2 uses a custom pipeline
            output = model.generate(
                **inputs,
                exaggeration=req.exaggeration,
                cfg_weight=req.cfg_weight,
            )

        audio_np = output.squeeze().cpu().numpy()
        buf = io.BytesIO()
        sf.write(buf, audio_np, samplerate=24000, format="WAV")
        buf.seek(0)

        return StreamingResponse(
            buf,
            media_type="audio/wav",
            headers={"X-Voice-Mode": MODE},
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
