import { unwrap, type components } from '@soltec/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { useApiClient } from '../access/SessionContext';

export type StoredFile = components['schemas']['File'];

export type PhotoSize = 'normal' | 'thumbnail';

export interface UploadInput {
  /** The photo already shrunk and its name. */
  photo: Blob;
  name: string;
  metadata?: components['schemas']['PhotoMetadata'];
  /** Chosen by the app, so sending the same photo again never stores it twice. */
  id: string;
}

/** Uploads a photo as a multipart form, the way the contract describes it. */
export function useUploadPhoto() {
  const apiClient = useApiClient();
  return useMutation({
    mutationFn: async ({ photo, name, metadata, id }: UploadInput) => {
      const form = new FormData();
      form.append('file', photo, name);
      form.append('id', id);
      if (metadata) {
        form.append('metadata', JSON.stringify(metadata));
      }
      return unwrap(
        await apiClient.POST('/v1/files', {
          // The contract types the form as an object with a binary string; the browser's FormData goes out as it is,
          // and the browser writes the Content-Type header, with the boundary of this form.
          body: form as unknown as { file: string },
          bodySerializer: (body) => body as unknown as FormData,
        }),
      );
    },
  });
}

/**
 * The image of a stored photo, as an address the page can show. It needs the bearer token, which an image tag cannot
 * send, so the image is fetched like any other call and handed to the page as a `blob:` address that is released
 * when it is no longer used.
 */
export function useFileImage(fileId: string | undefined, size: PhotoSize) {
  const apiClient = useApiClient();
  const query = useQuery({
    queryKey: ['files', fileId, size],
    enabled: fileId !== undefined,
    // The API revalidates with its ETag, so a photo that is deactivated or no longer reachable stops being served.
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(
        await apiClient.GET('/v1/files/{fileId}/content', {
          params: { path: { fileId: fileId ?? '' }, query: { size } },
          parseAs: 'blob',
        }),
      ) as unknown as Blob,
  });
  const url = useMemo(
    () => (query.data ? URL.createObjectURL(query.data) : undefined),
    [query.data],
  );
  useEffect(() => {
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [url]);

  return { url, isLoading: query.isLoading, isError: query.isError };
}
