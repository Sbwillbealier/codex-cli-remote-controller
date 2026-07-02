const sessionStorageKey = "codex.remote.sessionToken";

interface AuthorizeResponse {
  sessionId: string;
  sessionToken: string;
  expiresAt: string;
  deviceName: string;
}

export type InitialAuthResult =
  | {
      status: "authorized";
      sessionToken: string;
    }
  | {
      status: "pairing";
      pairingToken: string;
    }
  | {
      status: "unpaired";
    };

export function authHeaders(sessionToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${sessionToken}`,
  };
}

export async function authorizePairingToken(oneTimeToken: string) {
  const response = await fetch("/api/auth/authorize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: oneTimeToken,
      deviceName: window.navigator.userAgent.slice(0, 80),
    }),
  });

  if (!response.ok) {
    throw new Error(`Authorization failed: ${response.status}`);
  }

  const data = (await response.json()) as AuthorizeResponse;
  window.localStorage.setItem(sessionStorageKey, data.sessionToken);
  cleanTokenFromUrl();
  return data.sessionToken;
}

async function verifySession(sessionToken: string) {
  const response = await fetch("/api/auth/session", {
    headers: authHeaders(sessionToken),
  });

  return response.ok;
}

function tokenFromCurrentUrl() {
  return new URLSearchParams(window.location.search).get("token");
}

function cleanTokenFromUrl() {
  const url = new URL(window.location.href);

  if (!url.searchParams.has("token")) {
    return;
  }

  url.searchParams.delete("token");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function clearSessionToken() {
  window.localStorage.removeItem(sessionStorageKey);
}

export async function resolveInitialAuth(): Promise<InitialAuthResult> {
  const existingToken = window.localStorage.getItem(sessionStorageKey);

  if (existingToken && (await verifySession(existingToken))) {
    return {
      status: "authorized",
      sessionToken: existingToken,
    };
  }

  window.localStorage.removeItem(sessionStorageKey);

  const urlToken = tokenFromCurrentUrl();

  if (urlToken) {
    return {
      status: "pairing",
      pairingToken: urlToken,
    };
  }

  return {
    status: "unpaired",
  };
}
