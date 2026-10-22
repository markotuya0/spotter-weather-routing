import { createTheme } from '@mui/material/styles';

export const tokens = {
  ink: '#14222B',
  paper: '#F2F5F7',
  surface: '#FFFFFF',
  border: '#D3DCE2',
  brand: '#0E5F70',
  muted: '#5A6B77',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: tokens.brand },
    text: { primary: tokens.ink, secondary: tokens.muted },
    background: { default: tokens.paper, paper: tokens.surface },
  },
  shape: { borderRadius: 4 },
  typography: {
    fontFamily: '"Public Sans", system-ui, sans-serif',
    h1: { fontFamily: '"Overpass", system-ui, sans-serif' },
    h2: { fontFamily: '"Overpass", system-ui, sans-serif' },
    h3: { fontFamily: '"Overpass", system-ui, sans-serif' },
    h4: { fontFamily: '"Overpass", system-ui, sans-serif' },
    h5: { fontFamily: '"Overpass", system-ui, sans-serif' },
    h6: { fontFamily: '"Overpass", system-ui, sans-serif' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      defaultProps: { variant: 'outlined' },
      styleOverrides: {
        root: { borderColor: tokens.border, boxShadow: 'none' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { borderRadius: 4 },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.paper },
      },
    },
  },
});
