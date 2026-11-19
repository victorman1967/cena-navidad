(function () {
  'use strict';

  const config = window.CENA_CONFIG || {};
  const url = String(config.supabaseUrl || '').replace(/\/+$/, '');
  const key = String(config.supabaseKey || '');
  const bucket = 'fotos-cena';
  const enabled = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) && key.length > 20;
  const status = { failures: 0 };

  function headers(extra) {
    return Object.assign({
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    }, extra || {});
  }

  function splitPath(path) {
    const index = path.indexOf('/');
    return index === -1
      ? { table: path, id: null }
      : { table: path.slice(0, index), id: path.slice(index + 1) };
  }

  async function request(resource, options) {
    let response;
    try {
      response = await fetch(url + resource, options);
    } catch (error) {
      status.failures += 1;
      throw error;
    }
    if (!response.ok) {
      status.failures += 1;
      const detail = await response.text().catch(() => '');
      throw new Error(`Supabase ${response.status}: ${detail.slice(0, 140)}`);
    }
    status.failures = 0;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  function payload(item) {
    const copy = Object.assign({}, item);
    delete copy.synced;
    return copy;
  }

  async function keys(path) {
    const { table } = splitPath(path);
    const rows = await request(`/rest/v1/${table}?select=id`, { headers: headers() });
    const result = {};
    (rows || []).forEach((row) => { result[row.id] = true; });
    return result;
  }

  async function get(path) {
    const { table, id } = splitPath(path);
    if (!id) return null;
    const rows = await request(`/rest/v1/${table}?select=*&id=eq.${encodeURIComponent(id)}&limit=1`, { headers: headers() });
    return rows && rows[0] ? rows[0] : null;
  }

  async function uploadPhoto(id, src) {
    const match = /^data:([^;]+);base64,(.*)$/.exec(src);
    if (!match) return null;
    const bytes = Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0));
    const objectPath = `${id}.jpg`;
    const response = await fetch(`${url}/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true'
      },
      body: bytes
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Storage ${response.status}: ${detail.slice(0, 140)}`);
    }
    return {
      src: `${url}/storage/v1/object/public/${bucket}/${objectPath}`,
      storagePath: objectPath
    };
  }

  async function put(path, value) {
    const { table, id } = splitPath(path);
    let row = payload(value);
    if (table === 'photos' && id && typeof row.src === 'string' && row.src.indexOf('data:') === 0) {
      const uploaded = await uploadPhoto(id, row.src);
      if (uploaded) row = Object.assign({}, row, uploaded);
    }
    await request(`/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
      body: JSON.stringify(row)
    });
    return row;
  }

  async function remove(path) {
    const { table, id } = splitPath(path);
    if (!id) return;
    if (table === 'photos') {
      await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(id)}.jpg`, {
        method: 'DELETE',
        headers: { apikey: key, Authorization: `Bearer ${key}` }
      }).catch(() => {});
    }
    await request(`/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: headers({ Prefer: 'return=minimal' })
    });
  }

  window.CenaStore = { enabled, root: bucket, get, keys, put, remove, payload, status };
})();
