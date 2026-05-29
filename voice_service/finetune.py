"""
finetune.py — Fine-tune IndexTTS-2 on preprocessed voice clips.

Prerequisites:
    1. python prepare_data.py   (creates voices/clips/ and manifest.txt)
    2. GPU strongly recommended; CPU works but is slow.

Usage:
    cd voice_service
    python finetune.py

After training completes, update config.yaml:
    finetuned_checkpoint: "checkpoints/emma/best.pt"

Then restart main.py to load fine-tuned weights.
"""
import os

import soundfile as sf
import torch
import yaml
from torch.utils.data import DataLoader, Dataset
from transformers import AutoModel, AutoProcessor, get_linear_schedule_with_warmup

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.yaml")


def load_config() -> dict:
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


class VoiceDataset(Dataset):
    """Dataset that reads (clip_path, duration) pairs from manifest.txt."""

    def __init__(self, manifest_path: str, processor, sr: int) -> None:
        self.processor = processor
        self.sr = sr
        self.clips: list[str] = []
        with open(manifest_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                path, _ = line.split("|", 1)
                if os.path.exists(path):
                    self.clips.append(path)

    def __len__(self) -> int:
        return len(self.clips)

    def __getitem__(self, idx: int) -> dict:
        audio, _ = sf.read(self.clips[idx])
        if audio.ndim > 1:
            audio = audio.mean(axis=1)  # stereo -> mono
        return self.processor(audio=audio, sampling_rate=self.sr, return_tensors="pt")


def _save_checkpoint(path: str, epoch: int, model: torch.nn.Module, loss: float) -> None:
    torch.save(
        {"epoch": epoch, "model_state_dict": model.state_dict(), "loss": loss},
        path,
    )


def main() -> None:
    cfg = load_config()
    base_dir = os.path.dirname(__file__)

    clips_dir = os.path.join(base_dir, cfg["data"]["clips_dir"])
    manifest = os.path.join(clips_dir, "manifest.txt")
    output_dir = os.path.join(base_dir, cfg["training"]["output_dir"])
    os.makedirs(output_dir, exist_ok=True)

    if not os.path.exists(manifest):
        print(f"Manifest not found at {manifest}. Run prepare_data.py first.")
        return

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[finetune] Training on {device}")

    processor = AutoProcessor.from_pretrained(cfg["voice_service"]["model_id"])
    model = AutoModel.from_pretrained(cfg["voice_service"]["model_id"]).to(device)

    dataset = VoiceDataset(manifest, processor, cfg["data"]["sample_rate"])
    if len(dataset) == 0:
        print("No valid clips found in manifest. Run prepare_data.py first.")
        return

    print(f"[finetune] {len(dataset)} clips loaded")

    loader = DataLoader(
        dataset,
        batch_size=cfg["training"]["batch_size"],
        shuffle=True,
        num_workers=0,
    )

    optimizer = torch.optim.AdamW(model.parameters(), lr=cfg["training"]["learning_rate"])
    total_steps = len(loader) * cfg["training"]["epochs"]
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=cfg["training"]["warmup_steps"],
        num_training_steps=total_steps,
    )

    epochs: int = cfg["training"]["epochs"]
    save_every: int = cfg["training"]["save_every_n_epochs"]
    best_loss = float("inf")

    for epoch in range(1, epochs + 1):
        model.train()
        epoch_loss = 0.0

        for batch in loader:
            batch = {k: v.squeeze(1).to(device) for k, v in batch.items()}
            outputs = model(**batch, labels=batch.get("input_values"))
            loss = outputs.loss
            loss.backward()
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad()
            epoch_loss += loss.item()

        avg = epoch_loss / len(loader)
        print(f"Epoch {epoch}/{epochs} -- loss: {avg:.4f}")

        if avg < best_loss:
            best_loss = avg
            best_ckpt = os.path.join(output_dir, "best.pt")
            _save_checkpoint(best_ckpt, epoch, model, avg)
            print(f"  Saved best checkpoint -> {best_ckpt}")

        if epoch % save_every == 0:
            epoch_ckpt = os.path.join(output_dir, f"epoch_{epoch:03d}.pt")
            _save_checkpoint(epoch_ckpt, epoch, model, avg)

    print(f"\nTraining complete. Best loss: {best_loss:.4f}")
    print(f'Update config.yaml -> finetuned_checkpoint: "{output_dir}/best.pt"')
    print("Then restart voice service to load fine-tuned weights.")


if __name__ == "__main__":
    main()
