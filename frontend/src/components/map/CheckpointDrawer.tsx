import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import Paper from '@mui/material/Paper';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { CheckpointTable } from './CheckpointTable';

interface CheckpointDrawerProps {
  checkpoints: Checkpoint[];
  weatherSamples: Record<string, WeatherSample>;
  selectedIndex: number | null;
  onSelectCheckpoint: (index: number) => void;
}

/**
 * Desktop (>=1200px): collapsible panel docked at the bottom of the map region (`06` §2.1).
 * Tablet (768-1199px): right-side temporary drawer (`06` §2.2).
 * Mobile (<768px): a swipeable bottom sheet opened on demand (`06` §2.3).
 */
export function CheckpointDrawer({
  checkpoints,
  weatherSamples,
  selectedIndex,
  onSelectCheckpoint,
}: CheckpointDrawerProps) {
  const isMobile = useMediaQuery('(max-width:767.98px)');
  const isTablet = useMediaQuery('(min-width:768px) and (max-width:1199.98px)');
  const [open, setOpen] = useState(false);

  const label = `Checkpoints${checkpoints.length ? ` (${checkpoints.length})` : ''}`;
  const table = (
    <CheckpointTable
      checkpoints={checkpoints}
      weatherSamples={weatherSamples}
      selectedIndex={selectedIndex}
      onSelectCheckpoint={onSelectCheckpoint}
    />
  );

  if (isMobile) {
    return (
      <>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setOpen(true)}
          sx={{ position: 'absolute', bottom: 12, left: 12 }}
        >
          {label}
        </Button>
        <SwipeableDrawer anchor="bottom" open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}>
          <Box sx={{ maxHeight: '70vh' }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 0 }}>
              Checkpoints
            </Typography>
            {table}
          </Box>
        </SwipeableDrawer>
      </>
    );
  }

  if (isTablet) {
    return (
      <>
        <Button
          variant="outlined"
          size="small"
          onClick={() => setOpen(true)}
          sx={{ position: 'absolute', bottom: 12, left: 12 }}
        >
          {label}
        </Button>
        <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
          <Box sx={{ width: 340 }}>
            <Typography variant="subtitle2" sx={{ p: 2, pb: 0 }}>
              Checkpoints
            </Typography>
            {table}
          </Box>
        </Drawer>
      </>
    );
  }

  return (
    <Paper
      square
      sx={{
        borderTop: '1px solid',
        borderColor: 'divider',
        borderLeft: 0,
        borderRight: 0,
        borderBottom: 0,
        borderRadius: 0,
      }}
    >
      <Button
        fullWidth
        onClick={() => setOpen((value) => !value)}
        endIcon={open ? <ExpandMoreIcon /> : <ExpandLessIcon />}
        sx={{ justifyContent: 'space-between', px: 2, py: 1, borderRadius: 0 }}
      >
        {label}
      </Button>
      <Collapse in={open}>{table}</Collapse>
    </Paper>
  );
}
