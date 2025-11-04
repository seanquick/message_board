export async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw err;
  }

  return res.json();
}
