import Button from '@mui/material/Button';
import EditIcon from '@mui/icons-material/Edit';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TripInput } from '../../api/types';

function formatDepartureLabel(iso: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function TripSummary({ inputs, onEdit }: { inputs: TripInput; onEdit: () => void }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Stack spacing={0.5} sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {inputs.origin.label ?? 'Origin'} <Typography component="span" color="text.secondary">to</Typography>{' '}
            {inputs.destination.label ?? 'Destination'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Departs {formatDepartureLabel(inputs.departure_time)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {inputs.load_weight_lb.toLocaleString()} lb load · checkpoints every{' '}
            {inputs.checkpoint_interval_miles} mi
          </Typography>
        </Stack>
        <Button
          size="small"
          startIcon={<EditIcon fontSize="small" />}
          onClick={onEdit}
          aria-label="Edit trip details"
          sx={{ flexShrink: 0 }}
        >
          Edit trip
        </Button>
      </Stack>
    </Paper>
  );
}
