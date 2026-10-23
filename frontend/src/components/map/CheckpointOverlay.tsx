import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { CheckpointDetails } from './CheckpointDetails';

const POPUP_WIDTH = 260;
const VIEWPORT_MARGIN = 8;
// Keeps the popup clear of the "Fit routes" / "Conditions heatmap" buttons docked at the top of the map.
const TOP_CONTROLS_MARGIN = 56;

interface CheckpointOverlayProps {
  checkpoint: Checkpoint;
  weatherSample: WeatherSample | null;
  loadWeightLb: number;
  point: { x: number; y: number } | null;
  /** The map container's current pixel size, used to keep the popup inside the visible viewport. */
  containerSize: { width: number; height: number } | null;
  onClose: () => void;
}

/**
 * Desktop/tablet only: a floating card anchored to the checkpoint's screen position (`06` §2.1/2.2).
 * Mobile shows the same details inside CheckpointDrawer's bottom sheet instead, so there is a single
 * detail surface on narrow viewports rather than this popup stacking on top of that sheet.
 */
export function CheckpointOverlay({
  checkpoint,
  weatherSample,
  loadWeightLb,
  point,
  containerSize,
  onClose,
}: CheckpointOverlayProps) {
  const content = <CheckpointDetails checkpoint={checkpoint} weatherSample={weatherSample} loadWeightLb={loadWeightLb} />;
  const paperRef = useRef<HTMLDivElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState(180);

  useLayoutEffect(() => {
    const height = paperRef.current?.getBoundingClientRect().height;
    if (height) setMeasuredHeight(height);
  }, [checkpoint, weatherSample]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!point) return null;

  // Anchor above the checkpoint by default; flip below it when there isn't enough headroom, and
  // clamp both axes so the card never gets clipped by (or hidden under) the map's edges or controls.
  const idealLeft = point.x - POPUP_WIDTH / 2;
  const idealTopAbove = point.y - measuredHeight - 14;
  const containerWidth = containerSize?.width;
  const containerHeight = containerSize?.height;

  const left =
    containerWidth !== undefined
      ? Math.min(Math.max(idealLeft, VIEWPORT_MARGIN), Math.max(containerWidth - POPUP_WIDTH - VIEWPORT_MARGIN, VIEWPORT_MARGIN))
      : idealLeft;

  const placeAbove = containerHeight === undefined || idealTopAbove >= TOP_CONTROLS_MARGIN;
  const idealTop = placeAbove ? idealTopAbove : point.y + 14;
  const top =
    containerHeight !== undefined
      ? Math.min(
          Math.max(idealTop, TOP_CONTROLS_MARGIN),
          Math.max(containerHeight - measuredHeight - VIEWPORT_MARGIN, TOP_CONTROLS_MARGIN),
        )
      : idealTop;

  return (
    <Paper
      ref={paperRef}
      elevation={3}
      role="dialog"
      aria-label="Checkpoint details"
      sx={{
        position: 'absolute',
        left,
        top,
        p: 1.5,
        width: POPUP_WIDTH,
        maxWidth: `calc(100% - ${VIEWPORT_MARGIN * 2}px)`,
        zIndex: 5,
      }}
    >
      <IconButton
        aria-label="Close checkpoint details"
        size="small"
        onClick={onClose}
        sx={{ position: 'absolute', top: 4, right: 4 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
      {content}
    </Paper>
  );
}
