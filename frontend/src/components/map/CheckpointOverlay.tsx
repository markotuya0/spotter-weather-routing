import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Box from '@mui/material/Box';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { CheckpointDetails } from './CheckpointDetails';

interface CheckpointOverlayProps {
  checkpoint: Checkpoint;
  weatherSample: WeatherSample | null;
  loadWeightLb: number;
  point: { x: number; y: number } | null;
  isMobile: boolean;
  onClose: () => void;
}

/** Desktop/tablet: a floating card anchored to the checkpoint's screen position. Mobile: a bottom card (`06` §2.3). */
export function CheckpointOverlay({
  checkpoint,
  weatherSample,
  loadWeightLb,
  point,
  isMobile,
  onClose,
}: CheckpointOverlayProps) {
  const content = <CheckpointDetails checkpoint={checkpoint} weatherSample={weatherSample} loadWeightLb={loadWeightLb} />;

  if (isMobile) {
    return (
      <SwipeableDrawer
        anchor="bottom"
        open
        onClose={onClose}
        onOpen={() => {}}
        disableSwipeToOpen
        ModalProps={{ keepMounted: true }}
      >
        <Box sx={{ p: 2, pt: 1 }}>
          <Box
            sx={{
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: 'divider',
              mx: 'auto',
              mb: 1.5,
            }}
          />
          <IconButton
            aria-label="Close checkpoint details"
            size="small"
            onClick={onClose}
            sx={{ position: 'absolute', top: 8, right: 8 }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
          {content}
        </Box>
      </SwipeableDrawer>
    );
  }

  if (!point) return null;

  return (
    <Paper
      elevation={3}
      role="dialog"
      aria-label="Checkpoint details"
      sx={{
        position: 'absolute',
        left: point.x,
        top: point.y,
        transform: 'translate(-50%, calc(-100% - 14px))',
        p: 1.5,
        width: 260,
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
