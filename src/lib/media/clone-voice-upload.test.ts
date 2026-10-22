import { describe, it, expect, vi, beforeEach } from "vitest";

const { upload, compressVoiceStrong } = vi.hoisted(() => ({
  upload: vi.fn(async (_f: Blob, _n: string, _o: unknown) => ({ secureUrl: "https://x/media/audio/a.mp3" })),
  compressVoiceStrong: vi.fn(),
}));
vi.mock("./providers", () => ({
  providers: [],
  activeProvider: () => ({ isEnabled: () => true, upload }),
  supabaseMediaProvider: { isEnabled: () => true, upload },
}));
vi.mock("@/lib/audio/voice-compress", async (orig) => ({
  ...(await orig<typeof import("@/lib/audio/voice-compress")>()),
  compressVoiceStrong,
}));

import { uploadCloneVoiceUrl } from "./media-service";

describe("Admin voice library upload", () => {
  beforeEach(() => { upload.mockClear(); compressVoiceStrong.mockClear(); });

  it("uploads the original file unchanged, never compressing it", async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4, 5])], "voice.mp3", { type: "audio/mpeg" });
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("probably");
    await uploadCloneVoiceUrl(original);
    expect(compressVoiceStrong).not.toHaveBeenCalled();
    expect(upload.mock.calls[0]![0]).toBe(original);
    expect(upload.mock.calls[0]![2]).toMatchObject({ compress: false });
  });

  it("rejects a format the browser cannot play instead of converting it", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "canPlayType").mockReturnValue("");
    const f = new File([new Uint8Array([1])], "voice.amr", { type: "audio/amr" });
    await expect(uploadCloneVoiceUrl(f)).rejects.toThrow(/không phát được/);
    expect(upload).not.toHaveBeenCalled();
  });
});
