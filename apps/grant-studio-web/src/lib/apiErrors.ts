export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function responseError(response: Response, fallback: string): Promise<ApiError> {
  let body: { error?: { code?: string; message?: string }; message?: string } | undefined;
  try {
    body = await response.clone().json();
  } catch { /* Proxies can return HTML or an empty response. */ }
  return new ApiError(body?.error?.code ?? "unknown", body?.error?.message ?? body?.message ?? fallback, response.status);
}
