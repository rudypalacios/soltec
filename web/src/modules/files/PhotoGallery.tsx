import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import { Box, Dialog, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState, type KeyboardEvent, type TouchEvent } from 'react';
import { useFileImage } from './useFiles';

/** How far a finger must travel sideways to count as a swipe, in px. */
const SWIPE_DISTANCE = 50;

/** Keeps the photos next to the one on screen in the cache, so moving to them is instant. */
function Preload({ fileId }: { fileId: string | undefined }) {
  useFileImage(fileId, 'normal');
  return null;
}

function StripThumbnail({
  fileId,
  position,
  selected,
  onSelect,
}: {
  fileId: string;
  position: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const image = useFileImage(fileId, 'thumbnail');
  return (
    <Box
      component="button"
      type="button"
      aria-label={`Ver la foto ${position}`}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      sx={{
        flexShrink: 0,
        width: 56,
        height: 56,
        p: 0,
        borderRadius: 1,
        overflow: 'hidden',
        cursor: 'pointer',
        bgcolor: 'rgba(255,255,255,0.12)',
        border: 2,
        borderColor: selected ? '#fff' : 'transparent',
        opacity: selected ? 1 : 0.65,
      }}
    >
      {image.url ? (
        <Box
          component="img"
          src={image.url}
          alt=""
          sx={{ width: 1, height: 1, objectFit: 'cover', display: 'block' }}
        />
      ) : null}
    </Box>
  );
}

/**
 * The photos of one comment, full screen on a dark background. It opens at the photo that was touched and moves only
 * among that comment's photos. Arrows or the keyboard on a desktop, a swipe on a phone; a strip of thumbnails says
 * where the person is and jumps to any of them.
 */
export function PhotoGallery({
  fileIds,
  startIndex,
  onClose,
}: {
  fileIds: readonly string[];
  startIndex: number;
  onClose: () => void;
}) {
  const count = fileIds.length;
  const [index, setIndex] = useState(Math.min(startIndex, Math.max(count - 1, 0)));
  const touchStart = useRef<number | null>(null);
  // The thread refreshes on its own: if a photo leaves the comment while it is open, stay inside what is left.
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(count - 1, 0)));
  }, [count]);

  const go = (step: number) => setIndex((current) => (current + step + count) % count);
  const image = useFileImage(fileIds[index], 'normal');

  const keys = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      go(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      go(-1);
    }
  };
  const touchEnd = (event: TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined || count < 2) {
      return;
    }
    if (end - start <= -SWIPE_DISTANCE) {
      go(1);
    } else if (end - start >= SWIPE_DISTANCE) {
      go(-1);
    }
  };

  const arrow = (side: 'left' | 'right') => (
    <IconButton
      aria-label={side === 'left' ? 'Foto anterior' : 'Foto siguiente'}
      onClick={() => go(side === 'left' ? -1 : 1)}
      sx={{
        position: 'absolute',
        top: '50%',
        [side]: { xs: 4, md: 16 },
        transform: 'translateY(-50%)',
        width: 48,
        height: 48,
        color: '#fff',
        bgcolor: 'rgba(0,0,0,0.45)',
        '&:hover': { bgcolor: 'rgba(0,0,0,0.65)' },
        // On a phone the swipe is the gesture; the arrows stay for a mouse.
        display: { xs: 'none', md: 'inline-flex' },
      }}
    >
      {side === 'left' ? <ChevronLeftIcon /> : <ChevronRightIcon />}
    </IconButton>
  );

  return (
    <Dialog
      open
      fullScreen
      onClose={onClose}
      slotProps={{
        paper: {
          'aria-label': 'Galería de fotos',
          sx: { bgcolor: 'rgba(8, 10, 12, 0.96)', color: '#fff' },
        },
      }}
    >
      <Box
        onKeyDown={keys}
        onTouchStart={(event) => {
          touchStart.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={touchEnd}
        sx={{ display: 'flex', flexDirection: 'column', height: '100dvh', touchAction: 'pan-y' }}
      >
        <Stack
          direction="row"
          sx={{ alignItems: 'center', justifyContent: 'space-between', px: 2, minHeight: 56 }}
        >
          <Typography aria-live="polite" sx={{ fontWeight: 600 }}>
            {index + 1} / {count}
          </Typography>
          <IconButton
            aria-label="Cerrar la galería"
            onClick={onClose}
            autoFocus
            sx={{ color: '#fff', width: 48, height: 48 }}
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <Box
          sx={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            display: 'grid',
            placeItems: 'center',
            px: { xs: 1, md: 10 },
          }}
        >
          {image.url ? (
            <Box
              component="img"
              src={image.url}
              alt={`Foto ${index + 1} de ${count}`}
              sx={{ maxWidth: 1, maxHeight: 1, objectFit: 'contain', userSelect: 'none' }}
            />
          ) : image.isError ? (
            <Typography>No se pudo cargar la foto.</Typography>
          ) : (
            <LinearProgress aria-label="Cargando la foto" sx={{ width: 160, height: 6 }} />
          )}
          {count > 1 ? arrow('left') : null}
          {count > 1 ? arrow('right') : null}
        </Box>

        {count > 1 ? (
          <Stack
            direction="row"
            spacing={1}
            sx={{ p: 1.5, overflowX: 'auto', justifyContent: { md: 'center' } }}
          >
            {fileIds.map((fileId, position) => (
              <StripThumbnail
                key={fileId}
                fileId={fileId}
                position={position + 1}
                selected={position === index}
                onSelect={() => setIndex(position)}
              />
            ))}
          </Stack>
        ) : null}
        <Preload fileId={fileIds[(index + 1) % count]} />
        <Preload fileId={fileIds[(index - 1 + count) % count]} />
      </Box>
    </Dialog>
  );
}
