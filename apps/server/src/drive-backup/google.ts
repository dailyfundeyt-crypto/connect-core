/**
 * Google OAuth + Drive REST calls for the Connect backup (scope `drive.file` only).
 *
 * `drive.file` is the least privilege that works: Connect can see and change only the files and
 * folders it created itself ("Connect Backup"), nothing else in the person's Drive.
 */
export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const FOLDER_NAME = "Connect Backup";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export type OAuthClient = { clientId: string; clientSecret: string; redirectUri: string };

export type DriveFile = {
  id: string;
  name: string;
  size?: string;
  createdTime?: string;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
};

/** Never leaks a token: Google error bodies are reduced to their error code / message. */
export class GoogleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function failure(response: Response, what: string): Promise<GoogleError> {
  let code: string | undefined;
  let detail = "";
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string; status?: string; errors?: Array<{ reason?: string }> };
      error_description?: string;
    };
    if (typeof body.error === "string") {
      code = body.error;
      detail = body.error_description ?? body.error;
    } else if (body.error) {
      code = body.error.errors?.[0]?.reason ?? body.error.status;
      detail = body.error.message ?? "";
    }
  } catch {
    /* not JSON */
  }
  return new GoogleError(
    `${what} fehlgeschlagen (HTTP ${response.status}${detail ? `: ${detail}` : ""})`,
    response.status,
    code,
  );
}

export function authorizationUrl(
  client: OAuthClient,
  input: { state: string; codeChallenge: string; loginHint?: string },
): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    response_type: "code",
    scope: DRIVE_FILE_SCOPE,
    // offline + consent: Google only hands out a refresh token on a consent it just showed.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  if (input.loginHint) params.set("login_hint", input.loginHint);
  return `${AUTH_URL}?${params.toString()}`;
}

export type TokenSet = { accessToken: string; refreshToken?: string; expiresAt: number; scope: string };

async function tokenRequest(body: URLSearchParams, what: string, fetchImpl: typeof fetch): Promise<TokenSet> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw await failure(response, what);
  const json = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!json.access_token) throw new GoogleError(`${what}: keine Antwort mit Token`, 502);
  return {
    accessToken: json.access_token,
    ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}),
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000,
    scope: json.scope ?? "",
  };
}

export function exchangeCode(
  client: OAuthClient,
  code: string,
  verifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code,
      code_verifier: verifier,
      grant_type: "authorization_code",
      redirect_uri: client.redirectUri,
    }),
    "Google-Anmeldung (Code tauschen)",
    fetchImpl,
  );
}

export function refreshAccessToken(
  client: OAuthClient,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    new URLSearchParams({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    "Google-Token erneuern",
    fetchImpl,
  );
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

export class DriveClient {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(url: string, init: RequestInit, what: string): Promise<Response> {
    const response = await this.fetchImpl(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${this.accessToken}` },
    });
    if (!response.ok) throw await failure(response, what);
    return response;
  }

  async about(): Promise<{ email?: string; name?: string; storageQuota?: { limit?: string; usage?: string } }> {
    const r = await this.call(`${DRIVE}/about?fields=user(emailAddress,displayName),storageQuota(limit,usage)`, {}, "Drive-Konto lesen");
    const json = (await r.json()) as { user?: { emailAddress?: string; displayName?: string }; storageQuota?: { limit?: string; usage?: string } };
    return {
      ...(json.user?.emailAddress ? { email: json.user.emailAddress } : {}),
      ...(json.user?.displayName ? { name: json.user.displayName } : {}),
      ...(json.storageQuota ? { storageQuota: json.storageQuota } : {}),
    };
  }

  async getFile(id: string): Promise<(DriveFile & { trashed?: boolean }) | null> {
    try {
      const r = await this.call(
        `${DRIVE}/files/${encodeURIComponent(id)}?fields=id,name,size,createdTime,md5Checksum,trashed,appProperties`,
        {},
        "Drive-Datei lesen",
      );
      return (await r.json()) as DriveFile & { trashed?: boolean };
    } catch (error) {
      if (error instanceof GoogleError && error.status === 404) return null;
      throw error;
    }
  }

  /** The "Connect Backup" folder: the remembered id if it still exists, else found or created. */
  async ensureFolder(knownId?: string | null): Promise<string> {
    if (knownId) {
      const existing = await this.getFile(knownId);
      if (existing && !existing.trashed) return existing.id;
    }
    const q = `name = '${FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false and 'root' in parents`;
    const r = await this.call(`${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`, {}, "Backup-Ordner suchen");
    const found = ((await r.json()) as { files?: DriveFile[] }).files?.[0];
    if (found) return found.id;
    const created = await this.call(
      `${DRIVE}/files?fields=id`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME, appProperties: { connectBackup: "folder" } }),
      },
      "Backup-Ordner anlegen",
    );
    return ((await created.json()) as { id: string }).id;
  }

  async upload(input: {
    folderId: string;
    name: string;
    bytes: Uint8Array;
    appProperties: Record<string, string>;
  }): Promise<DriveFile> {
    const boundary = `connect-${crypto.randomUUID()}`;
    const meta = JSON.stringify({
      name: input.name,
      parents: [input.folderId],
      mimeType: "application/octet-stream",
      appProperties: input.appProperties,
    });
    const head = new TextEncoder().encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`,
    );
    const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
    const body = new Uint8Array(head.length + input.bytes.length + tail.length);
    body.set(head, 0);
    body.set(input.bytes, head.length);
    body.set(tail, head.length + input.bytes.length);
    const r = await this.call(
      `${UPLOAD}/files?uploadType=multipart&fields=id,name,size,createdTime,md5Checksum,appProperties`,
      { method: "POST", headers: { "content-type": `multipart/related; boundary=${boundary}` }, body },
      "Upload nach Google Drive",
    );
    return (await r.json()) as DriveFile;
  }

  async list(folderId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const q = `'${folderId}' in parents and trashed = false`;
      const url =
        `${DRIVE}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=200` +
        `&fields=nextPageToken,files(id,name,size,createdTime,md5Checksum,appProperties)` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "");
      const r = await this.call(url, {}, "Backups auflisten");
      const json = (await r.json()) as { files?: DriveFile[]; nextPageToken?: string };
      files.push(...(json.files ?? []));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return files.filter((f) => f.appProperties?.connectBackup === "1");
  }

  async download(id: string): Promise<Uint8Array> {
    const r = await this.call(`${DRIVE}/files/${encodeURIComponent(id)}?alt=media`, {}, "Backup herunterladen");
    return new Uint8Array(await r.arrayBuffer());
  }

  /** Into Drive's bin (recoverable for 30 days), never a hard delete. */
  async trash(id: string): Promise<void> {
    await this.call(
      `${DRIVE}/files/${encodeURIComponent(id)}?fields=id`,
      { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ trashed: true }) },
      "Altes Backup in den Papierkorb",
    );
  }
}
