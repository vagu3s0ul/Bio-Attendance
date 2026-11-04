/**
 * Browser face pipeline — the same MobileFaceNet model and preprocessing as
 * the Android app, so a template enrolled here is usable by the app's scan and
 * vice versa.
 *
 *   photo → face-api.js TinyFaceDetector → padded square crop → 112×112
 *         → mobilefacenet.tflite (tfjs-tflite, WASM) → 192-number embedding
 *
 * The engine files live in `public/face` and are served from the web root, so
 * everything is same-origin and needs no CDN:
 *
 *   /face/tf.min.js, /face/tf-tflite.min.js, /face/face-api.min.js
 *   /face/models/tiny_face_detector_model-*
 *   /face/mobilefacenet.tflite
 *   /face/tflite_web_api_cc_simd.{js,wasm}
 *
 * Only the embedding leaves this module; pixels never do.
 */

export const MODEL_INPUT_SIZE = 112;

const FACE_ROOT = '/face';
const DETECTOR_URI = `${FACE_ROOT}/models`;
const MODEL_URI = `${FACE_ROOT}/mobilefacenet.tflite`;
const SCRIPTS = [
  `${FACE_ROOT}/tf.min.js`,
  `${FACE_ROOT}/tf-tflite.min.js`,
  `${FACE_ROOT}/face-api.min.js`,
];

// The UMD builds in public/face attach themselves to window.
declare global {
  interface Window {
    tf?: any;
    tflite?: any;
    faceapi?: any;
  }
}

interface BrowserEngine {
  model: any;
  faceapi: any;
  tf: any;
}

let enginePromise: Promise<BrowserEngine> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (existing.dataset.loaded === '1') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), {
        once: true,
      });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

async function getEngine(): Promise<BrowserEngine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      for (const src of SCRIPTS) await loadScript(src);

      const faceapi = window.faceapi;
      const tf = window.tf;
      const tflite = window.tflite;
      if (!faceapi || !tf || !tflite) {
        throw new Error('The face engine did not start in this browser.');
      }

      await faceapi.nets.tinyFaceDetector.loadFromUri(DETECTOR_URI);
      tflite.setWasmPath(`${FACE_ROOT}/`);
      const model = await tflite.loadTFLiteModel(MODEL_URI);

      return { model, faceapi, tf };
    })().catch((e: any) => {
      enginePromise = null;
      throw new Error(
        e?.message || 'The face engine could not load. Reload the page and try again.'
      );
    });
  }
  return enginePromise;
}

/** No cached files exist here; the browser owns the photo's lifetime. */
export function discardCapture(_uri?: string | null): void {}

/** Warm the engine up (the model is ~5 MB and loads once). */
export async function loadFaceModel() {
  const { model, tf } = await getEngine();

  return {
    inputs: [
      {
        name: 'input',
        shape: [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3],
        dataType: 'float32',
      },
    ],
    outputs: [{ name: 'output', shape: [1, 192], dataType: 'float32' }],
    run: async (inputs: Float32Array[]) => {
      const tensor = tf.tensor4d(inputs[0], [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
      const output = model.predict(tensor);
      const data = Array.from(output.dataSync()) as number[];
      tensor.dispose();
      output.dispose();
      return [Float32Array.from(data)];
    },
  };
}

/** Tensor shapes shown by the enrollment screen. */
export async function faceModelInfo() {
  await getEngine();
  return {
    inputs: [{ name: 'input', shape: [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3], dataType: 'float32' }],
    outputs: [{ name: 'output', shape: [1, 192], dataType: 'float32' }],
  };
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read that photo. Try another image.'));
    image.src = uri;
  });
}

function l2Normalise(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm) return vector;
  return vector.map((v) => v / norm);
}

/** Distance metric used for every comparison (embeddings are normalized). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return -1;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface FaceEmbedding {
  embedding: number[];
  /** Bounding box in the source photo, for the guide overlay. */
  box: { left: number; top: number; width: number; height: number };
}

/**
 * Detect the largest face in a photo and return its 192-number embedding.
 * Returns null when no face is visible; throws when the engine is unusable.
 *
 * `imageWidth`/`imageHeight` are accepted for parity with the native module;
 * the browser decodes the image and uses its natural size when they are 0.
 */
export async function embeddingFromPhoto(
  uri: string,
  imageWidth: number,
  imageHeight: number
): Promise<FaceEmbedding | null> {
  const { faceapi, tf, model } = await getEngine();
  const image = await loadImage(uri);

  const width = image.naturalWidth || imageWidth;
  const height = image.naturalHeight || imageHeight;
  if (!width || !height) {
    throw new Error('Could not read the photo size. Try again.');
  }

  const detection = await faceapi.detectSingleFace(
    image,
    new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
  );

  const box = detection?.box;
  if (!box || box.width < 8 || box.height < 8) return null;

  // Same 30% padding and square-ish crop the native pipeline uses.
  const padX = box.width * 0.3;
  const padY = box.height * 0.3;
  const left = Math.max(0, Math.round(box.x - padX));
  const top = Math.max(0, Math.round(box.y - padY));
  const cropWidth = Math.min(width - left, Math.round(box.width + padX * 2));
  const cropHeight = Math.min(height - top, Math.round(box.height + padY * 2));
  if (cropWidth < 8 || cropHeight < 8) return null;

  const canvas = document.createElement('canvas');
  canvas.width = MODEL_INPUT_SIZE;
  canvas.height = MODEL_INPUT_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('The browser could not prepare the image.');

  ctx.drawImage(image, left, top, cropWidth, cropHeight, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

  const pixels = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE).data;
  const input = new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE * 3);
  for (let i = 0; i < MODEL_INPUT_SIZE * MODEL_INPUT_SIZE; i++) {
    const p = i * 4;
    input[i * 3] = (pixels[p] - 127.5) / 127.5;
    input[i * 3 + 1] = (pixels[p + 1] - 127.5) / 127.5;
    input[i * 3 + 2] = (pixels[p + 2] - 127.5) / 127.5;
  }

  const tensor = tf.tensor4d(input, [1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
  const output = model.predict(tensor);
  const vector = Array.from(output.dataSync()) as number[];
  tensor.dispose();
  output.dispose();

  if (vector.length !== 192) {
    throw new Error(`Unexpected model output (${vector.length} numbers, expected 192).`);
  }

  return {
    embedding: l2Normalise(vector),
    box: { left: box.x, top: box.y, width: box.width, height: box.height },
  };
}

export interface FaceCandidate {
  roll: string;
  name: string;
  embeddings: number[][];
}

export interface FaceMatch {
  roll: string;
  name: string;
  score: number;
}

/**
 * Best cosine match across every enrolled sample. Each student's best sample
 * wins, which keeps multiple enrollment angles useful without averaging them
 * into a blurry centroid.
 */
export function findBestMatch(
  embedding: number[],
  candidates: FaceCandidate[],
  threshold: number
): FaceMatch | null {
  let best: FaceMatch | null = null;

  for (const student of candidates) {
    for (const probe of student.embeddings) {
      if (!Array.isArray(probe) || probe.length !== embedding.length) continue;
      const score = cosineSimilarity(embedding, probe);
      if (!best || score > best.score) {
        best = { roll: student.roll, name: student.name, score };
      }
    }
  }

  if (best && best.score >= threshold) return best;
  return null;
}
