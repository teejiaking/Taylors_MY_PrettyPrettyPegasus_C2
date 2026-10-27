export class WorkspaceApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function serverApi<T = unknown>(
  route: string,
  method = "GET",
  body?: unknown,
  request: typeof fetch = fetch,
): Promise<T> {
  const multipart = body instanceof FormData;
  const response = await request("/api/" + route, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers:
      body !== undefined && !multipart
        ? { "Content-Type": "application/json" }
        : undefined,
    body: multipart
      ? body
      : body === undefined
        ? undefined
        : JSON.stringify(body),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new WorkspaceApiError(
      response.status,
      "The workspace is unavailable. Try again shortly.",
    );
  const data = await response.json();
  if (!response.ok)
    throw new WorkspaceApiError(
      response.status,
      typeof data.error === "string"
        ? data.error
        : "The request could not be completed.",
    );
  return data as T;
}
