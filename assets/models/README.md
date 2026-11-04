# Face model

`mobilefacenet.tflite` is bundled into the Android build and loaded by
`services/face.ts` (via `react-native-fast-tflite`).

## I/O contract

| Tensor | Shape | Type | Pre-processing |
|---|---|---|---|
| input `input` | `[1, 112, 112, 3]` | float32 | RGB, `(pixel - 127.5) / 127.5` |
| output `embeddings` | `[1, 192]` | float32 | L2-normalised by the app before matching |

The pipeline detects the largest face with ML Kit, crops it with 30% padding,
resizes to 112×112 and feeds that crop to the model.

## Provenance

This is a public MobileFaceNet conversion (112×112 input, 192-d output),
downloaded from a public demo repository. It is not trained by this project.

- Size: 5,233,552 bytes
- SHA-1: `e13f377b74251f71023f2009a962674ff68b4bfa`

If the app is redistributed commercially, confirm the model's licensing for
your jurisdiction before shipping. Replacing it with another MobileFaceNet is
fine as long as the input shape stays 112×112×3 and the output is a single
embedding vector; update `MODEL_INPUT_SIZE` and the vector-length handling in
`services/face.ts` only if the shapes differ.

## Replacing the model

1. Drop the new `.tflite` here (keep the filename or update `MODEL_SOURCE`).
2. `npx expo export --platform android` to confirm Metro bundles it.
3. Rebuild the APK — native code cannot pick up a new asset without a build.
