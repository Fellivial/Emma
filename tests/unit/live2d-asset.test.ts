/**
 * Live2D asset ↔ code compatibility guard (Phase 6).
 *
 * The avatar engine wraps every model.expression()/model.motion() call in
 * try/catch, so an asset that doesn't declare the expression names, motion
 * groups, or hit areas the code uses fails SILENTLY — the rig loads but
 * never emotes. These tests pin the bundled asset to the engine's contract.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AVATAR_EXPRESSIONS } from "@/types/emma";

const MODEL_DIR = join(__dirname, "../../public/live2d/emma/Design_genius_White");
const MANIFEST_PATH = join(MODEL_DIR, "Design_genius(1).model3.json");

// Motion groups the engine calls (avatar-engine.ts: motion("Talk",0,2),
// motion("Idle",undefined,1), motion("Tap_Head"), motion("Tap_Body")).
const REQUIRED_MOTION_GROUPS = ["Idle", "Talk", "Tap_Head", "Tap_Body"];
// Hit area names checked in the manual pointerdown handler.
const REQUIRED_HIT_AREAS = ["Head", "Body"];

interface Manifest {
  FileReferences: {
    Moc: string;
    Expressions?: { Name: string; File: string }[];
    Motions?: Record<string, { File: string }[]>;
  };
  Groups?: { Target: string; Name: string; Ids: string[] }[];
  HitAreas?: { Id: string; Name: string }[];
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

describe("Live2D model manifest", () => {
  it("declares an expression for every AvatarExpression value", () => {
    const names = (manifest.FileReferences.Expressions ?? []).map((e) => e.Name);
    for (const expr of AVATAR_EXPRESSIONS) {
      expect(names, `missing expression "${expr}"`).toContain(expr);
    }
  });

  it("references only expression files that exist and parse", () => {
    for (const e of manifest.FileReferences.Expressions ?? []) {
      const p = join(MODEL_DIR, e.File);
      expect(existsSync(p), `${e.File} missing on disk`).toBe(true);
      const exp = JSON.parse(readFileSync(p, "utf8"));
      expect(exp.Type).toBe("Live2D Expression");
      expect(Array.isArray(exp.Parameters)).toBe(true);
      for (const param of exp.Parameters) {
        expect(typeof param.Id).toBe("string");
        expect(typeof param.Value).toBe("number");
      }
    }
  });

  it("declares every motion group the engine calls", () => {
    const groups = Object.keys(manifest.FileReferences.Motions ?? {});
    for (const g of REQUIRED_MOTION_GROUPS) {
      expect(groups, `missing motion group "${g}"`).toContain(g);
    }
  });

  it("references only motion files that exist with consistent Meta counts", () => {
    for (const [group, motions] of Object.entries(manifest.FileReferences.Motions ?? {})) {
      for (const m of motions) {
        const p = join(MODEL_DIR, m.File);
        expect(existsSync(p), `${group}: ${m.File} missing on disk`).toBe(true);
        const motion = JSON.parse(readFileSync(p, "utf8"));
        expect(motion.Version).toBe(3);

        // Recompute Meta counts from curves — the Cubism runtime trusts
        // these counts, so a mismatch corrupts playback.
        let segments = 0;
        let points = 0;
        for (const curve of motion.Curves) {
          const s: number[] = curve.Segments;
          points += 1; // initial point (t, v)
          let i = 2;
          while (i < s.length) {
            segments += 1;
            const type = s[i];
            if (type === 1) {
              i += 7; // bezier: 3 control points
              points += 3;
            } else {
              i += 3; // linear / stepped / inverse-stepped: 1 point
              points += 1;
            }
          }
        }
        expect(motion.Meta.CurveCount, `${m.File} CurveCount`).toBe(motion.Curves.length);
        expect(motion.Meta.TotalSegmentCount, `${m.File} SegmentCount`).toBe(segments);
        expect(motion.Meta.TotalPointCount, `${m.File} PointCount`).toBe(points);
      }
    }
  });

  it("declares Head and Body hit areas", () => {
    const names = (manifest.HitAreas ?? []).map((h) => h.Name);
    for (const area of REQUIRED_HIT_AREAS) {
      expect(names, `missing hit area "${area}"`).toContain(area);
    }
  });

  it("wires the LipSync and EyeBlink parameter groups", () => {
    const groups = Object.fromEntries((manifest.Groups ?? []).map((g) => [g.Name, g.Ids]));
    expect(groups.LipSync).toContain("ParamMouthOpenY");
    expect(groups.EyeBlink).toEqual(expect.arrayContaining(["ParamEyeLOpen", "ParamEyeROpen"]));
  });

  it("does not use the tears animation as an idle motion", () => {
    // idle.motion3.json in this asset pack is a crying loop (tear params
    // Param38/39/40) mislabeled as idle — it must never be in a motion group.
    for (const motions of Object.values(manifest.FileReferences.Motions ?? {})) {
      for (const m of motions) {
        expect(m.File).not.toBe("idle.motion3.json");
      }
    }
  });
});
