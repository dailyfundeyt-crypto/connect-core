/**
 * The one place the browser talks to the API server.
 *
 * WHAT THIS REPLACES. Every read opened with the same four lines — fetch with `credentials`, check
 * `ok`, throw a sentence, unwrap the envelope — and every entity that wrote more than once grew its
 * own private copy of the same request helper: `agentRequest`, `componentRequest`, and two others,
 * identical apart from the fallback sentence. Four copies of one function is four places for the
 * `body.error` extraction to be forgotten, and it had been, in more than one of them.
 *
 * WHAT IT DOES NOT DO. It owns the transport and nothing about meaning. The envelope key and the
 * sentence a person reads are per-endpoint facts, so they stay at the call site — a client that
 * guessed the envelope would be a client that had to be argued with.
 */

export type ClientOptions = {
  /** Absent means GET. */
  method?: string;
  /** Serialised as JSON, which is also what sets the content type. */
  body?: unknown;
  /**
   * What a person reads when the server sent no message of its own.
   *
   * Name the entity in it — "Could not load coworkers" rather than "Request failed" — because this
   * is the sentence that reaches the screen when the server is the one that broke.
   */
  fallback?: string;
  /** For the calls a Bot makes on a person's behalf, which are abandoned when the turn is. */
  signal?: AbortSignal;
  /**
   * Returns the parsed body instead of the `Response`, for endpoints that answer flat.
   *
   * Not sent to the server -- it picks the return shape, nothing more. See the
   * overloads below.
   */
  unwrap?: boolean;
};

/** Every request in this app is authenticated, and every one of them is JSON or nothing. */
async function send(path: string, options: ClientOptions): Promise<Response> {
  return fetch(path, {
    method: options.method,
    credentials: "include",
    headers:
      options.body === undefined
        ? undefined
        : { "content-type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/**
 * A request whose failure is a value rather than a throw.
 *
 * For the endpoints where a refusal is the answer: the gateway declining a component call, or the
 * catalogue announcement that is allowed to come back empty. Those callers read the status
 * themselves, and turning a refusal into an exception would make the boundary working look like the
 * boundary breaking.
 */
export function tryClient(
  path: string,
  options: ClientOptions = {},
): Promise<Response> {
  return send(path, options);
}

/**
 * A request that throws when the server says no, carrying the server's own message.
 *
 * With a `key`, the JSON body is parsed and that key unwrapped, so a caller receives the payload
 * rather than the envelope it arrived in. Without one, the `Response` is returned for a caller that
 * only needed to know it worked.
 */
export async function client<T>(
  path: string,
  key: string,
  options?: ClientOptions,
): Promise<T>;
/**
 * A request against an endpoint that answers flat, unwrapped.
 *
 * Separate from the key form rather than solved by passing a key that does not
 * exist: `body[key]` on a flat payload is `undefined`, and a caller that trusts it
 * goes on to read `.path` off nothing. This returns the whole object, typed.
 *
 * `unwrap` is what tells the two forms apart at the type level, rather than
 * argument position. Many callers pass only `{ fallback }` and then call `.json()`
 * themselves; without a discriminating property TypeScript would have to guess,
 * and whichever overload it picked would break the other group.
 */
export async function client<T>(
  path: string,
  options: ClientOptions & { unwrap: true },
): Promise<T>;
export async function client(
  path: string,
  options?: ClientOptions,
): Promise<Response>;
export async function client<T>(
  path: string,
  keyOrOptions?: string | ClientOptions,
  maybeOptions?: ClientOptions,
): Promise<T | Response> {
  const key = typeof keyOrOptions === "string" ? keyOrOptions : undefined;
  const options =
    (typeof keyOrOptions === "string" ? maybeOptions : keyOrOptions) ?? {};

  // `unwrap` is dropped here: it selects the return shape, it is not a request field.
  const { unwrap: _unwrap, ...sent } = options;
  const response = await send(path, sent);

  if (!response.ok) {
    /*
     * The server's message is the useful one: it names the field or the permission that failed. The
     * fallback is only for the cases where it sent none, or sent something that is not JSON.
     */
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new Error(message ?? options.fallback ?? "That request failed.");
  }

  if (key === undefined && options.unwrap !== true) return response;

  /*
   * A 204 or a non-JSON body used to throw a bare SyntaxError, and `null` or an array body threw
   * a TypeError on property access. Malformed success is a failed request with the fallback.
   *
   * This is reached by both unwrapping forms, and the difference is only what is
   * handed back: with a key the caller wants one field, with `unwrap` it wants the
   * whole object. The body has to be an object either way.
   */
  const body = (await response.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(options.fallback ?? "That request failed.");
  }
  return key === undefined ? (body as T) : (body as Record<string, T>)[key];
}
