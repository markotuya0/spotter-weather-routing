import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState, type ReactNode } from 'react';

interface AppShellProps {
  panel: ReactNode;
  mapRegion: ReactNode;
  /** Shown in a floating chip over the map when the tablet panel is collapsed (`06` §2.2). */
  summaryChip?: ReactNode;
}

export function AppShell({ panel, mapRegion, summaryChip }: AppShellProps) {
  // Custom 768/1200 px breakpoints per `06` §2.2 (not MUI's default sm/md/lg).
  const isRowLayout = useMediaQuery('(min-width:768px)');
  const isTablet = useMediaQuery('(min-width:768px) and (max-width:1199.98px)');
  const [tabletPanelOpen, setTabletPanelOpen] = useState(true);
  // Re-open the panel when leaving the tablet breakpoint (adjusting state during render instead
  // of an effect — https://react.dev/learn/you-might-not-need-an-effect).
  const [wasTablet, setWasTablet] = useState(isTablet);
  if (wasTablet !== isTablet) {
    setWasTablet(isTablet);
    if (!isTablet) setTabletPanelOpen(true);
  }

  const panelCollapsed = isTablet && !tabletPanelOpen;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        // Row layout (tablet/desktop) pins the shell to the viewport so the panel and map region
        // scroll internally; the mobile stacked layout keeps growing with the page instead.
        height: isRowLayout ? '100vh' : 'auto',
        overflow: isRowLayout ? 'hidden' : 'visible',
      }}
    >
      <a href="#results-panel" className="skip-link">
        Skip to results
      </a>
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Toolbar>
          <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontFamily: '"Overpass", sans-serif' }}>
            Spotter weather routing
          </Typography>
          <Link
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            variant="body2"
            underline="hover"
          >
            Weather data by Open-Meteo
          </Link>
        </Toolbar>
      </AppBar>

      <Box
        component="main"
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: isRowLayout ? 'row' : 'column',
          minHeight: 0,
        }}
      >
        {
          // Kept mounted (never conditionally rendered) even while collapsed, so the trip form's
          // own state isn't lost when the tablet panel toggles — only its visibility changes.
        }
        <Box
          id="results-panel"
          sx={{
            position: 'relative',
            width: panelCollapsed ? 0 : isRowLayout ? (isTablet ? 340 : 400) : '100%',
            flexShrink: 0,
            p: panelCollapsed ? 0 : 2,
            pt: panelCollapsed ? 0 : isTablet ? 5 : 2,
            overflow: panelCollapsed ? 'hidden' : 'auto',
            borderRight: isRowLayout && !panelCollapsed ? '1px solid' : 'none',
            borderColor: 'divider',
          }}
        >
          {isTablet && (
            <IconButton
              aria-label="Collapse trip panel"
              size="small"
              onClick={() => setTabletPanelOpen(false)}
              sx={{ position: 'absolute', top: 4, right: 4 }}
            >
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          )}
          {panel}
        </Box>
        <Box
          role="region"
          aria-label="Route map"
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: isRowLayout ? 0 : 280,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'background.default',
            overflow: isRowLayout ? 'hidden' : 'visible',
          }}
        >
          {mapRegion}
          {panelCollapsed && (
            <Paper
              elevation={3}
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                p: 1,
                pl: 1.5,
                display: 'flex',
                gap: 1,
                alignItems: 'center',
                maxWidth: 'calc(100% - 24px)',
              }}
            >
              <Typography variant="body2" noWrap>
                {summaryChip}
              </Typography>
              <Button size="small" variant="text" onClick={() => setTabletPanelOpen(true)}>
                Edit trip
              </Button>
            </Paper>
          )}
        </Box>
      </Box>
    </Box>
  );
}
