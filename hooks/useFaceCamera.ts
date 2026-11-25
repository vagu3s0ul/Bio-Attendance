import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraView } from 'expo-camera';

export type CameraFacing = 'front' | 'back';

/**
 * Shared camera lifecycle for the face check (scan) and face enrol screens.
 *
 * Why this exists: remounting <CameraView> (key change) to swap front/back is
 * a trap on Android. React destroys the old native view, and expo-camera's
 * `OnViewDestroys` calls `releaseCamera()`, which runs `unbindAll()` on a
 * `mainQueue.launch` — i.e. asynchronously, *after* the freshly mounted view
 * has already bound itself. The stale unbind then unbinds the new session, so
 * the preview goes black and `onCameraReady` never fires. Every later remount
 * repeats the race, which is why the "tap to restart" button also never
 * recovered.
 *
 * The fix:
 *  - switching front/back only changes the `facing` prop, so expo-camera
 *    rebinds in place (`OnViewDidUpdateProps` -> `createCamera()`), and there
 *    is no native view teardown to race with;
 *  - a stalled preview is healed with the imperative `resumePreview()` (same
 *    view, unbind + bind) before falling back to a full remount;
 *  - full remounts stay available, but only after the old native view has been
 *    destroyed (a short gap), so the stale `unbindAll()` always lands first.
 */

/** How long a (re)opened camera may take to report ready before we retry. */
const STALL_TIMEOUT_MS = 6000;
/** Gap between tearing down the old view and mounting a new one. */
const REMOUNT_GAP_MS = 400;

export function useFaceCamera(initialFacing: CameraFacing) {
  const camera = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraFacing>(initialFacing);
  const [camKey, setCamKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  // `mounted` false renders no camera at all for one gap, so the native view
  // is fully destroyed (and its releaseCamera() has run) before the next one
  // starts binding.
  const [mounted, setMounted] = useState(true);
  const [ready, setReady] = useState(false);
  const [stalled, setStalled] = useState(false);

  const readyRef = useRef(false);
  const aliveRef = useRef(true);
  const retriesRef = useRef(0);
  const gapRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (gapRef.current) clearTimeout(gapRef.current);
    };
  }, []);

  const onCameraReady = useCallback(() => {
    readyRef.current = true;
    retriesRef.current = 0;
    setReady(true);
    setStalled(false);
  }, []);

  /** Full restart: destroy the view, let it release, then mount a fresh one. */
  const restart = useCallback(() => {
    readyRef.current = false;
    retriesRef.current = 0;
    setReady(false);
    setStalled(false);
    setMounted(false);
    if (gapRef.current) clearTimeout(gapRef.current);
    gapRef.current = setTimeout(() => {
      gapRef.current = null;
      if (!aliveRef.current) return;
      setCamKey((k) => k + 1);
      setMounted(true);
    }, REMOUNT_GAP_MS);
  }, []);

  /** Soft restart: rebind the existing native view (no teardown, no race). */
  const heal = useCallback(() => {
    readyRef.current = false;
    setReady(false);
    setStalled(false);
    const view = camera.current;
    if (!view) {
      restart();
      return;
    }
    setAttempt((a) => a + 1);
    Promise.resolve(view.resumePreview()).catch(() => restart());
  }, [restart]);

  /**
   * Arms a watchdog for every new camera session. The first timeout heals the
   * view in place; if that also stalls, the manual restart button appears.
   */
  useEffect(() => {
    if (!mounted) return;
    readyRef.current = false;
    setReady(false);
    setStalled(false);
    const t = setTimeout(() => {
      if (readyRef.current || !aliveRef.current) return;
      if (retriesRef.current < 1) {
        retriesRef.current = 1;
        heal();
      } else {
        setStalled(true);
      }
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [camKey, facing, mounted, attempt, heal]);

  /**
   * Flip front/back. Only the prop changes: expo-camera unbinds and rebinds
   * the new lens itself, which keeps the preview alive within ~1 second.
   */
  const switchFacing = useCallback(() => {
    readyRef.current = false;
    retriesRef.current = 0;
    setReady(false);
    setStalled(false);
    setFacing((f) => (f === 'front' ? 'back' : 'front'));
  }, []);

  return {
    camera,
    facing,
    camKey,
    mounted,
    ready,
    stalled,
    switchFacing,
    restart,
    heal,
    onCameraReady,
  };
}
