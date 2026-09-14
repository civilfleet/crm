import { env, pipeline } from "@huggingface/transformers";
import {
  CONTACT_PASTE_MAX_LENGTH,
  type ContactEntityToken,
  type ContactPasteWorkerMessage,
  extractContactName,
} from "@/lib/contact-paste";

env.allowLocalModels = false;
// A worker already keeps inference off the UI thread. One WASM thread also works
// without cross-origin isolation headers.
if (env.backends.onnx.wasm) env.backends.onnx.wasm.numThreads = 1;

const post = (message: ContactPasteWorkerMessage) => self.postMessage(message);
const createDetector = () =>
  pipeline("token-classification", "onnx-community/NeuroBERT-NER-ONNX", {
    revision: "e3a6a290e438a506d2ba7bbb0f5875b7f034cebf",
    dtype: "q8",
    device: "wasm",
    progress_callback: (progress) => {
      if (progress.status === "progress")
        post({ type: "status", message: "Downloading contact detector…" });
    },
  });
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
