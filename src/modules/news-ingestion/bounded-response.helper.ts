import { NewsIngestionError } from './news-ingestion.errors';

export const readBoundedResponseBody = async (
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> => {
  const contentLength = response.headers.get('content-length');
  if (
    contentLength &&
    /^\d+$/u.test(contentLength) &&
    Number(contentLength) > maximumBytes
  ) {
    throw new NewsIngestionError(
      'NEWS_PROVIDER_RESPONSE_TOO_LARGE',
      'News provider response exceeds the configured size limit',
    );
  }

  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel();
        throw new NewsIngestionError(
          'NEWS_PROVIDER_RESPONSE_TOO_LARGE',
          'News provider response exceeds the configured size limit',
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
};
