import AddAPhotoOutlined from '@mui/icons-material/AddAPhotoOutlined';
import { Alert, Box, Button, IconButton, LinearProgress, Stack, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { newUuidV7, type PhotoPreparer } from '@soltec/shared';
import { useRef, useState, type ChangeEvent } from 'react';
import { webPhotoPreparer } from '../../adapters/webPhotoPreparer';
import { fieldMessages, problemMessage } from '../access/messages';
import { useFileImage, useUploadPhoto } from './useFiles';

/** A photo that is on the server: what a form keeps to send with the record that adopts it. */
export interface UploadedPhoto {
  id: string;
  name: string;
}

/** A photo that is still going up, or that failed and can be sent again. */
interface PendingPhoto {
  /** The id the photo will have. It is chosen here and kept for retries, so one photo is never stored twice. */
  id: string;
  name: string;
  source: File;
  failure: string | null;
}

const SIZE_MESSAGE = 'La foto pesa demasiado (máximo 10 MB).';

/** What the person reads for each refusal of the API that an upload can cause. */
const FILE_FIELD_MESSAGES = {
  file: {
    too_large: SIZE_MESSAGE,
    unsupported_type: 'Solo se aceptan fotos JPEG, PNG o WebP.',
    invalid: 'No se pudo leer la foto. Prueba con otra.',
    required: 'Elige una foto.',
  },
};

/**
 * Picks photos, shrinks them in the browser, uploads them and lists them with their thumbnail. It holds the list
 * of photos that are on the server (`value`) and leaves to the form what that list means: the record that adopts
 * the photos is another slice's. A photo that fails stays in the list with its reason and can be sent again.
 */
export function PhotoUploader({
  value,
  onChange,
  max = 10,
  preparer = webPhotoPreparer,
}: {
  value: readonly UploadedPhoto[];
  onChange: (photos: UploadedPhoto[]) => void;
  max?: number;
  /** The platform's implementation of the photo port; tests pass their own. */
  preparer?: PhotoPreparer;
}) {
  const upload = useUploadPhoto();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<readonly PendingPhoto[]>([]);
  // The photos that finish at different moments each add themselves to the latest list, not to the one they saw.
  const latest = useRef(value);
  latest.current = value;
  const room = max - value.length - pending.length;

  const send = async (photo: PendingPhoto) => {
    setPending((list) =>
      list.map((item) => (item.id === photo.id ? { ...item, failure: null } : item)),
    );
    let prepared;
    try {
      prepared = await preparer.prepare(photo.source, photo.name);
    } catch {
      // The browser could not open the picture (a format it does not know, a damaged file): nothing was sent.
      const failure = 'No se pudo preparar la foto. Prueba con otra.';
      setPending((list) =>
        list.map((item) => (item.id === photo.id ? { ...item, failure } : item)),
      );
      return;
    }
    try {
      const stored = await upload.mutateAsync({
        id: photo.id,
        photo: prepared.photo,
        name: prepared.name,
        metadata: prepared.metadata,
      });
      setPending((list) => list.filter((item) => item.id !== photo.id));
      if (!latest.current.some((item) => item.id === stored.id)) {
        onChange([...latest.current, { id: stored.id, name: stored.original_name }]);
      }
    } catch (error) {
      const failure =
        fieldMessages(error, FILE_FIELD_MESSAGES).file ??
        problemMessage(error, { forbidden: 'No tienes permiso para subir fotos.' });
      setPending((list) =>
        list.map((item) => (item.id === photo.id ? { ...item, failure } : item)),
      );
    }
  };

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []).slice(0, Math.max(room, 0));
    // The same photo can be chosen again after removing it, so the input is emptied.
    event.target.value = '';
    const added = chosen.map((source) => ({
      id: newUuidV7(),
      name: source.name,
      source,
      failure: null,
    }));
    setPending((list) => [...list, ...added]);
    added.forEach((photo) => void send(photo));
  };

  const dismiss = (id: string) => setPending((list) => list.filter((item) => item.id !== id));
  const remove = (id: string) => onChange(value.filter((item) => item.id !== id));

  return (
    <Stack spacing={1.5}>
      <Box>
        <Button
          variant="outlined"
          startIcon={<AddAPhotoOutlined />}
          disabled={room <= 0}
          onClick={() => input.current?.click()}
        >
          Agregar fotos
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          aria-label="Elegir fotos"
          onChange={choose}
        />
        {room <= 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Llegaste al máximo de {max} fotos.
          </Typography>
        ) : null}
      </Box>

      {value.length + pending.length > 0 ? (
        <Stack component="ul" spacing={1} aria-label="Fotos" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {value.map((photo) => (
            <PhotoRow
              key={photo.id}
              name={photo.name}
              thumbnail={<Thumbnail fileId={photo.id} name={photo.name} />}
              action={
                <IconButton aria-label={`Quitar «${photo.name}»`} onClick={() => remove(photo.id)}>
                  <CloseIcon />
                </IconButton>
              }
            />
          ))}
          {pending.map((photo) => (
            <PhotoRow
              key={photo.id}
              name={photo.name}
              thumbnail={<ThumbnailSlot />}
              message={
                photo.failure ? (
                  <Alert severity="error">{photo.failure}</Alert>
                ) : (
                  <ProgressBar label={`Subiendo «${photo.name}»`} />
                )
              }
              action={
                photo.failure ? (
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" onClick={() => void send(photo)}>
                      Reintentar
                    </Button>
                    <IconButton
                      aria-label={`Quitar «${photo.name}»`}
                      onClick={() => dismiss(photo.id)}
                    >
                      <CloseIcon />
                    </IconButton>
                  </Stack>
                ) : null
              }
            />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

function PhotoRow({
  name,
  thumbnail,
  message,
  action,
}: {
  name: string;
  thumbnail: React.ReactNode;
  message?: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <Box component="li" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: 56, height: 56, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        {thumbnail}
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography sx={{ overflowWrap: 'anywhere' }}>{name}</Typography>
        {message}
      </Box>
      {action}
    </Box>
  );
}

/** The 320 px thumbnail of a stored photo, fetched with the session's token. */
function Thumbnail({ fileId, name }: { fileId: string; name: string }) {
  const image = useFileImage(fileId, 'thumbnail');
  if (image.url) {
    return (
      <Box
        component="img"
        src={image.url}
        alt={`Foto «${name}»`}
        sx={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 1 }}
      />
    );
  }
  return image.isError ? (
    <Typography variant="caption" color="text.secondary">
      Sin vista previa
    </Typography>
  ) : (
    <ThumbnailSlot label={`Cargando «${name}»`} />
  );
}

/**
 * A progress bar for a photo that is going up or coming down. The browser's fetch does not report how many bytes it
 * has sent, so the bar is the indeterminate kind: it says «working», not «40 %».
 */
export function ProgressBar({ label }: { label: string }) {
  return (
    <Box sx={{ mt: 0.5 }}>
      <LinearProgress aria-label={label} sx={{ height: 6, borderRadius: 3 }} />
      <Typography variant="caption" color="text.secondary">
        {label.startsWith('Subiendo') ? 'Subiendo…' : 'Cargando…'}
      </Typography>
    </Box>
  );
}

/** The grey square a thumbnail will fill, with a bar while it loads. */
export function ThumbnailSlot({ label }: { label?: string }) {
  return (
    <Box
      sx={{
        width: 56,
        height: 56,
        borderRadius: 1,
        bgcolor: 'action.hover',
        display: 'flex',
        alignItems: 'flex-end',
        overflow: 'hidden',
      }}
    >
      {label ? <LinearProgress aria-label={label} sx={{ width: 1, height: 4 }} /> : null}
    </Box>
  );
}
