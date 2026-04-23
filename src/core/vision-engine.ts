"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { VisionFrame, VisionAnalysis } from "@/types/emma";
import { uid } from "@/lib/utils";

interface UseVisionReturn {
  active: boolean;
  supported: boolean;
  previewRef: React.RefObject<HTMLVideoElement>;
  lastAnalysis: VisionAnalysis | null;
  analyzing: boolean;
  start: () => Promise<boolean>;
  stop: () => void;
  captureFrame: () => VisionFrame | null;
  analyzeScene: (context?: string) => Promise<VisionAnalysis | null>;
}

/**
 * Screen capture engine — replaces webcam vision.
 *
 * Uses getDisplayMedia to capture the user's screen/window/tab.
 * Frames are captured on-demand for Claude Vision analysis.
 *
 * Flow:
 *   start() → getDisplayMedia → stream to <video> (preview)
 *   captureFrame() → draw video to offscreen canvas → base64
 *   analyzeScene() → capture + POST to /api/emma/vision → VisionAnalysis
 */
export function useVision(): UseVisionReturn {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<VisionAnalysis | null>(null);

  const previewRef = useRef<HTMLVideoElement>(null!);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null!);

  // Check support on mount
  useEffect(() => {
    if (
      typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === "function"
    ) {
      setSupported(true);
    }
    if (typeof document !== "undefined") {
      canvasRef.current = document.createElement("canvas");
    }
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 5 }, // Low FPS — we only need snapshots
        },
        audio: false,
      });

      streamRef.current = stream;

      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        await previewRef.current.play();
      }

      // Handle user stopping share via browser UI
      stream.getVideoTracks()[0].addEventListener("ended", () => {
        setActive(false);
        streamRef.current = null;
        if (previewRef.current) {
          previewRef.current.srcObject = null;
        }
      });

      setActive(true);
      return true;
    } catch (err) {
      console.warn("[EMMA Vision] Screen share denied:", err);
      return false;
    }
  }, [supported]);

  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewRef.current) {
      previewRef.current.srcObject = null;
    }
    setActive(false);
  }, []);

  const captureFrame = useCallback((): VisionFrame | null => {
    const video = previewRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !active) return null;

    // Scale down for API efficiency
    const maxWidth = 1024;
    const scale = Math.min(1, maxWidth / (video.videoWidth || 1280));
    canvas.width = Math.round((video.videoWidth || 1280) * scale);
    canvas.height = Math.round((video.videoHeight || 720) * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    const base64 = dataUrl.split(",")[1];

    return {
      id: uid(),
      timestamp: Date.now(),
      dataUrl,
      base64,
      mediaType: "image/jpeg",
    };
  }, [active]);

  const analyzeScene = useCallback(
    async (context?: string): Promise<VisionAnalysis | null> => {
      const frame = captureFrame();
      if (!frame) return null;

      setAnalyzing(true);

      try {
        const res = await fetch("/api/emma/vision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            frame: frame.base64,
            mediaType: frame.mediaType,
            context,
          }),
        });

        const data = await res.json();

        if (data.error) {
          console.error("[EMMA Vision] Analysis error:", data.error);
          return null;
        }

        setLastAnalysis(data.analysis);
        return data.analysis;
      } catch (err) {
        console.error("[EMMA Vision] Analysis failed:", err);
        return null;
      } finally {
        setAnalyzing(false);
      }
    },
    [captureFrame]
  );

  return {
    active,
    supported,
    previewRef,
    lastAnalysis,
    analyzing,
    start,
    stop,
    captureFrame,
    analyzeScene,
  };
}
