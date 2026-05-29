"""
prepare_data.py — split raw recordings into 5–15s mono 16kHz clips for fine-tuning.

Usage:
    cd voice_service
    python prepare_data.py

Outputs:
    voices/clips/*.wav          — trimmed, mono, 16kHz clips ready for training
    voices/clips/manifest.txt   — one line per clip: path|duration_seconds
    voices/emma_ref.wav         — a clean 10s clip used as zero-shot reference
"""
import os
import yaml
import soundfile as sf
import librosa

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")


def load_config():
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


def process_file(
    path: str, clips_dir: str, sr: int, min_s: float, max_s: float, stride_s: float | None = None
) -> list[tuple[str, float]]:
    """Split a single WAV into clips. Returns list of (clip_path, duration_seconds)."""
    try:
        audio, _ = librosa.load(path, sr=sr, mono=True)
    except Exception as exc:
        print(f"  [skip] {os.path.basename(path)}: {exc}")
        return []
    total = len(audio)
    clip_len = int(max_s * sr)
    stride = int((stride_s if stride_s is not None else max_s) * sr)
    clips: list[tuple[str, float]] = []
    i = 0
    clip_idx = 0
    base = os.path.splitext(os.path.basename(path))[0]

    while i + int(min_s * sr) <= total:
        chunk = audio[i : i + clip_len]
        duration = len(chunk) / sr
        if duration >= min_s:
            out_name = f"{base}_clip{clip_idx:04d}.wav"
            out_path = os.path.join(clips_dir, out_name)
            sf.write(out_path, chunk, sr)
            clips.append((out_path, duration))
            clip_idx += 1
        i += stride

    return clips


def main():
    cfg = load_config()
    base_dir = os.path.dirname(__file__)
    raw_dir = os.path.join(base_dir, cfg["data"]["raw_dir"])
    clips_dir = os.path.join(base_dir, cfg["data"]["clips_dir"])
    sr = cfg["data"]["sample_rate"]
    min_s = cfg["data"]["min_clip_seconds"]
    max_s = cfg["data"]["max_clip_seconds"]
    ref_path = os.path.join(base_dir, cfg["voice_service"]["reference_audio"])

    os.makedirs(clips_dir, exist_ok=True)
    os.makedirs(os.path.dirname(ref_path), exist_ok=True)

    wav_files = [f for f in os.listdir(raw_dir) if f.lower().endswith(".wav")]
    if not wav_files:
        print(f"No WAV files found in {raw_dir}")
        return

    print(f"Processing {len(wav_files)} recording(s)...")
    stride_s = cfg["data"].get("clip_stride_seconds", max_s)
    all_clips: list[tuple[str, float]] = []
    for fname in sorted(wav_files):
        fpath = os.path.join(raw_dir, fname)
        clips = process_file(fpath, clips_dir, sr, min_s, max_s, stride_s)
        total_dur = sum(d for _, d in clips)
        print(f"  {fname}: {len(clips)} clips, {total_dur:.1f}s total")
        all_clips.extend(clips)

    manifest_path = os.path.join(clips_dir, "manifest.txt")
    with open(manifest_path, "w") as mf:
        for clip_path, dur in all_clips:
            mf.write(f"{clip_path}|{dur:.3f}\n")

    total = sum(d for _, d in all_clips)
    print(f"\nTotal: {len(all_clips)} clips, {total / 60:.1f} min of training audio")
    print(f"Manifest: {manifest_path}")

    # Save a clean 10s reference clip from the longest recording
    if not os.path.exists(ref_path):
        longest = max(
            [os.path.join(raw_dir, f) for f in wav_files],
            key=lambda p: sf.info(p).duration,
        )
        audio, _ = librosa.load(longest, sr=sr, mono=True)
        # Skip first 2s (often quiet/noise at recording start), take next 10s
        end = min(12 * sr, len(audio))
        ref_audio = audio[2 * sr : end]
        if len(ref_audio) < 5 * sr:
            print(f"  [warn] Reference clip is only {len(ref_audio)/sr:.1f}s — consider using a longer recording")
        sf.write(ref_path, ref_audio, sr)
        print(f"Reference audio saved: {ref_path} ({len(ref_audio)/sr:.1f}s)")
    else:
        print(f"Reference audio already exists: {ref_path}")


if __name__ == "__main__":
    main()
