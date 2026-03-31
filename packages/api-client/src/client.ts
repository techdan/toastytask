/**
 * Base API client with authentication and error handling
 */

export interface ApiClientConfig {
  baseUrl: string;
  getAuthToken: () => Promise<string | null>;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message: string, public cause?: Error) {
    super(message);
    this.name = "NetworkError";
  }
}

export class ApiClient {
  constructor(private config: ApiClientConfig) {}

  /**
   * Make an authenticated fetch request
   */
  async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = await this.config.getAuthToken();

    const url = `${this.config.baseUrl}${path}`;
    console.log(`[API] Making ${options.method || 'GET'} request to:`, url);
    console.log(`[API] Has auth token:`, !!token);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers,
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new AuthError("Unauthorized");
        }

        const errorBody = await response.json().catch(() => ({
          error: "Unknown error",
        }));

        throw new ApiError(
          response.status,
          errorBody.error || "Request failed",
          errorBody.code,
          errorBody.details
        );
      }

      // Handle empty responses (204 No Content, etc.)
      const contentType = response.headers.get("content-type");
      if (
        !contentType?.includes("application/json") ||
        response.status === 204
      ) {
        return {} as T;
      }

      return response.json();
    } catch (error) {
      console.error('[API] Request failed:', {
        url,
        error,
        errorType: error?.constructor?.name,
        message: (error as Error)?.message
      });

      // Re-throw our custom errors
      if (
        error instanceof AuthError ||
        error instanceof ApiError ||
        error instanceof NetworkError
      ) {
        throw error;
      }

      // Wrap network errors
      if (error instanceof TypeError) {
        throw new NetworkError("Network request failed", error);
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T>(path: string, options?: Omit<RequestInit, "method">): Promise<T> {
    return this.fetch<T>(path, { ...options, method: "GET" });
  }

  /**
   * POST request
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestInit, "method" | "body">
  ): Promise<T> {
    return this.fetch<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestInit, "method" | "body">
  ): Promise<T> {
    return this.fetch<T>(path, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(
    path: string,
    options?: Omit<RequestInit, "method">
  ): Promise<T> {
    return this.fetch<T>(path, { ...options, method: "DELETE" });
  }
}
