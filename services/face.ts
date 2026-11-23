/**
 * On-device face pipeline (mirrors the Flutter "Student Bio Attendance" app):
 *
 *   photo → ML Kit largest face → padded square crop → 112×112 JPEG
 *         → MobileFaceNet TFLite → L2-normalised embedding
 *
 * Only embeddings leave the device; captured photos are never uploaded.
 */
import FaceDetection, { Face } from '@react-native-ml-kit/face-detection';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';
import { toByteArray } from 'base64-js';
import { loadTensorflowModel, type TensorflowModel } from 'react-native-fast-tflite';

export const MODEL_INPUT_SIZE = 112;
/** Fraction of the detected face box added on each side before cropping. */
const FACE_PADDING = 0.3;

// Bundled by Metro (metro.config.js adds "tflite" to assetExts).
const MODEL_SOURCE = require('../assets/models/mobilefacenet.tflite');

let modelPromise: Promise<TensorflowModel> | null = null;

/**
 * Camera captures and manipulated crops are cached files. A live scan takes
 * one every second, so they must not be left on disk.
 */
export function discardCapture(uri?: string | null): void {
  if (!uri) return;
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
}

/** Load (and cache) the bundled MobileFaceNet model. */
export function loadFaceModel(): Promise<TensorflowModel> {
  if (!modelPromise) {
    modelPromise = loadTensorflowModel(MODEL_SOURCE, 'default').catch((e: any) => {
      modelPromise = null;
      throw new Error(
        'The face model could not be loaded. Rebuild the app so assets/models/mobilefacenet.tflite is bundled.'
      );
    });
  }
  return modelPromise;
}

/** Input/output tensor shapes — shown in the enrollment screen for support. */
export async function faceModelInfo() {
  const model = await loadFaceModel();
  return {
    inputs: model.inputs.map((t) => ({ name: t.name, shape: t.shape, type: t.dataType })),
    outputs: model.outputs.map((t) => ({ name: t.name, shape: t.shape, type: t.dataType })),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function largestFace(faces: Face[]): Face {
  return faces.reduce((best, f) =>
    f.frame.width * f.frame.height > best.frame.width * best.frame.height ? f : best
  );
}

function l2Normalise(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (!norm) return vector;
  return vector.map((v) => v / norm);
}

/** Minimum gap between the best and runner-up match. A face that close to two
 * different students is ambiguous and must never auto-match. */
export const MATCH_MARGIN = 0.05;
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
 * Detect the largest face in a captured photo and return its embedding.
 * Returns null when no face is visible; throws when the model is unusable.
 */
export async function embeddingFromPhoto(
  uri: string,
  imageWidth: number,
  imageHeight: number
): Promise<FaceEmbedding | null> {
  if (!imageWidth || !imageHeight) {
    throw new Error('Could not read the photo size. Try again.');
  }

  const faces = await FaceDetection.detect(uri, {
    performanceMode: 'fast',
    landmarkMode: 'none',
    contourMode: 'none',
    classificationMode: 'none',
    minFaceSize: 0.15,
  });

  if (!faces || faces.length === 0) return null;

  const face = largestFace(faces);
  const frame = face.frame;
  if (!frame || frame.width < 8 || frame.height < 8) return null;

  const padX = frame.width * FACE_PADDING;
  const padY = frame.height * FACE_PADDING;
  const originX = clamp(Math.round(frame.left - padX), 0, Math.max(0, imageWidth - 2));
  const originY = clamp(Math.round(frame.top - padY), 0, Math.max(0, imageHeight - 2));
  const width = clamp(Math.round(frame.width + padX * 2), 1, imageWidth - originX);
  const height = clamp(Math.round(frame.height + padY * 2), 1, imageHeight - originY);

  // Crop to the face then shrink to the model's input size. Doing the resize
  // with the image library is far cheaper than decoding a full-resolution JPEG.
  const prepared = await ImageManipulator.manipulateAsync(
    uri,
    [
      { crop: { originX, originY, width, height } },
      { resize: { width: MODEL_INPUT_SIZE, height: MODEL_INPUT_SIZE } },
    ],
    { compress: 1, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  try {
    if (!prepared.base64) return null;

    const raw = decodeJpeg(toByteArray(prepared.base64), {
      useTArray: true,
      formatAsRGBA: true,
    });

    if (raw.width !== MODEL_INPUT_SIZE || raw.height !== MODEL_INPUT_SIZE) {
      throw new Error(`Unexpected face crop size (${raw.width}×${raw.height}).`);
    }

    const pixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const input = new Float32Array(pixels * 3);
    for (let i = 0; i < pixels; i++) {
      const p = i * 4;
      input[i * 3] = (raw.data[p] - 127.5) / 127.5;
      input[i * 3 + 1] = (raw.data[p + 1] - 127.5) / 127.5;
      input[i * 3 + 2] = (raw.data[p + 2] - 127.5) / 127.5;
    }

    const model = await loadFaceModel();
    const output = await model.run([input]);
    const vector = Array.from(output[0] as Float32Array);

    return {
      embedding: l2Normalise(vector),
      box: { left: frame.left, top: frame.top, width: frame.width, height: frame.height },
    };
  } finally {
    discardCapture(prepared.uri);
  }
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
 * into a blurry centroid. A match is only returned when it also clears the
 * threshold AND beats the best score of any *other* student by MATCH_MARGIN —
 * lookalike students must never flip on a hair's difference.
 */
export function findBestMatch(
  embedding: number[],
  candidates: FaceCandidate[],
  threshold: number
): FaceMatch | null {
  let best: FaceMatch | null = null;
  let secondBest = -Infinity;

  for (const student of candidates) {
    for (const probe of student.embeddings) {
      if (!Array.isArray(probe) || probe.length !== embedding.length) continue;
      const score = cosineSimilarity(embedding, probe);
      if (!best || score > best.score) {
        // The old best becomes the runner-up only when it belongs to a
        // different student — two samples of the same student are not rivals.
        if (best && best.roll !== student.roll) secondBest = Math.max(secondBest, best.score);
        best = { roll: student.roll, name: student.name, score };
      } else if (student.roll !== best.roll && score > secondBest) {
        secondBest = score;
      }
    }
  }

  if (!best || best.score < threshold) return null;
  if (secondBest > -Infinity && best.score - secondBest < MATCH_MARGIN) return null;
  return best;
}
