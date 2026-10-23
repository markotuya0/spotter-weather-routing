import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Collapse from '@mui/material/Collapse';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import SwipeableDrawer from '@mui/material/SwipeableDrawer';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import type { Checkpoint, WeatherSample } from '../../api/types';
import { CheckpointDetails } from './CheckpointDetails';
import { CheckpointTable } from './CheckpointTable';

interface CheckpointDrawerProps {
  checkpoints: Checkpoint[];
  weatherSamples: Record<string, WeatherSample>;
  selectedIndex: number | null;
  onSelectCheckpoint: (index: number | null) => void;
  loadWeightLb?: number;
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
  loadWeightLb = 0,
}: CheckpointDrawerProps) {
  const isMobile = useMediaQuery('(max-width:767.98px)');
  const isTablet = useMediaQuery('(min-width:768px) and (max-width:1199.98px)');
  const [open, setOpen] = useState(false);
  // On mobile the sheet shows the list or one checkpoint's details as mutually exclusive states;
  // "Back" sets this without touching the selection (so the map keeps its highlight), while a new
  // selection (tap on the map, or a fresh row) always jumps straight to details.
  const [forceList, setForceList] = useState(false);
  // A checkpoint picked on the map (rather than from this list) still needs its row visible, so
  // reveal the collapsed/closed panel whenever a selection lands here from outside it (adjusting
  // state during render instead of an effect — https://react.dev/learn/you-might-not-need-an-effect).
  const [lastSelectedIndex, setLastSelectedIndex] = useState(selectedIndex);
  if (selectedIndex !== lastSelectedIndex) {
    setLastSelectedIndex(selectedIndex);
    if (selectedIndex !== null) {
      setOpen(true);
      setForceList(false);
    }
  }

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
    const selectedCheckpoint = selectedIndex !== null ? checkpoints.find((c) => c.index === selectedIndex) ?? null : null;
    const showDetail = selectedCheckpoint !== null && !forceList;
    const weatherSample = selectedCheckpoint?.weather_sample_id
      ? weatherSamples[selectedCheckpoint.weather_sample_id] ?? null
      : null;
    // Dismissing the sheet entirely (vs. just going back to the list) also clears the selection,
    // so the map's highlight does not linger with nothing open to show its details.
    function handleClose() {
      setOpen(false);
      setForceList(false);
      onSelectCheckpoint(null);
    }

    return (
      <>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            setForceList(true);
            setOpen(true);
          }}
          sx={{ position: 'absolute', bottom: 12, left: 12 }}
        >
          {label}
        </Button>
        <SwipeableDrawer anchor="bottom" open={open} onOpen={() => setOpen(true)} onClose={handleClose}>
          <Box sx={{ maxHeight: '70vh', overflowY: 'auto', position: 'relative' }}>
            <Box
              sx={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'divider', mx: 'auto', mt: 1, mb: 0.5 }}
            />
            {showDetail && selectedCheckpoint ? (
              <Box sx={{ p: 2, pt: 0.5 }}>
                <Stack direction="row" sx={{ alignItems: 'center', mb: 1 }}>
                  <Button size="small" startIcon={<ArrowBackIcon fontSize="small" />} onClick={() => setForceList(true)}>
                    Back to list
                  </Button>
                  <IconButton
                    aria-label="Close checkpoint details"
                    size="small"
                    onClick={handleClose}
                    sx={{ ml: 'auto' }}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
                <CheckpointDetails checkpoint={selectedCheckpoint} weatherSample={weatherSample} loadWeightLb={loadWeightLb} />
              </Box>
            ) : (
              <>
                <Stack direction="row" sx={{ alignItems: 'center', px: 2, pt: 0.5 }}>
                  <Typography variant="subtitle2">Checkpoints</Typography>
                  <IconButton aria-label="Close checkpoints" size="small" onClick={handleClose} sx={{ ml: 'auto' }}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {table}
              </>
            )}
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
        sx={{
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderRadius: 0,
          '&:focus-visible': { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: -2 },
        }}
      >
        {label}
      </Button>
      <Collapse in={open}>{table}</Collapse>
    </Paper>
  );
}
