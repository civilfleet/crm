import { env, pipeline } from "@huggingface/transformers";
import {
  CONTACT_PASTE_MAX_LENGTH,
  type ContactEntityToken,
  type ContactPasteWorkerMessage,
  extractContactName,
} from "@/lib/contact-paste";

const DETECTOR_MODEL = "contact-detector-e3a6a290";

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = "/models/";
// A worker already keeps inference off the UI thread. One WASM thread also works
// without cross-origin isolation headers.
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.wasmPaths = {
    mjs: "/runtime/onnxruntime-web-1.22/ort-wasm-simd-threaded.mjs",
    wasm: "/runtime/onnxruntime-web-1.22/ort-wasm-simd-threaded.wasm",
  };
}

const post = (message: ContactPasteWorkerMessage) => self.postMessage(message);
const createDetector = () => {
  let announcedDownload = false;
  return pipeline("token-classification", DETECTOR_MODEL, {
    dtype: "q8",
    device: "wasm",
    local_files_only: true,
    progress_callback: (progress) => {
      if (progress.status === "progress" && !announcedDownload) {
        announcedDownload = true;
        post({ type: "status", message: "Downloading contact detector…" });
      }
    },
  });
};
let detector: ReturnType<typeof createDetector> | undefined;

self.onmessage = async (event: MessageEvent<string>) => {
  try {
    const text = event.data.slice(0, CONTACT_PASTE_MAX_LENGTH);
    post({ type: "status", message: "Loading contact detector…" });
    detector ??= createDetector();
    const classify = await detector;
    post({ type: "status", message: "Detecting contact name…" });
    // Short chunks stay within the model's 512-token limit, including long URLs.
    const names: string[] = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || line.length > 300 || /https?:\/\/|@/.test(line))
        continue;
      const tokens = await classify(line, { ignore_labels: [] });
      const name = extractContactName(line, tokens as ContactEntityToken[]);
      if (name) names.push(name);
    }
    const unique = [...new Set(names)];
    post({ type: "result", name: unique.length === 1 ? unique[0] : undefined });
  } catch {
    detector = undefined;
    post({ type: "error" });
  }
};
