import Alert from '@mui/material/Alert';
import Stack from '@mui/material/Stack';
import type { Warning } from '../../api/types';

export function WarningList({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Stack spacing={1}>
      {warnings.map((warning) => (
        <Alert key={warning.code} severity="warning">
          {warning.message}
        </Alert>
      ))}
    </Stack>
  );
}
