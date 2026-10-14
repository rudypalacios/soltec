import { Box } from '@mui/material';

/** Text with the part that matches what was searched marked, so the eye finds why a row came up. */
export function Highlight({ text, match }: { text: string; match: string | undefined }) {
  const needle = match?.trim();
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (!needle || index < 0) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, index)}
      <Box
        component="mark"
        sx={{ bgcolor: 'warning.light', color: 'inherit', borderRadius: 0.5, px: 0.25 }}
      >
        {text.slice(index, index + needle.length)}
      </Box>
      {text.slice(index + needle.length)}
    </>
  );
}
